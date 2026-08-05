import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../platform-core/prisma/prisma.service';
import { AppleWalletService } from './apple-wallet.service';
import { GoogleWalletService } from './google-wallet.service';
import { buildPassData, type PassData } from './pass-data';
import { passImages } from './pass-images';

/**
 * Issuing wallet passes for the signed-in customer's own cards.
 *
 * Everything here is person-scoped. A membership id is supplied by the client,
 * so it is checked against the caller before any pass is built — a pass carries
 * the member token that a till resolves, and handing one to the wrong person
 * would hand them someone else's balance.
 */
@Injectable()
export class WalletPassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apple: AppleWalletService,
    private readonly google: GoogleWalletService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private siteUrl(): string {
    return this.config.get<string>('PUBLIC_SITE_URL') ?? 'https://partnerspoints.ae';
  }

  /**
   * Loads the pass view of a membership the caller actually owns.
   *
   * The membership is read through the person that owns it rather than by id
   * alone, so an id belonging to somebody else reads as not-found instead of
   * leaking that it exists.
   */
  private async dataFor(personId: string, membershipId: string): Promise<PassData> {
    const owned = await this.prisma.customerMembership.findFirst({
      where: { id: membershipId, personId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('card not found');

    const data = await buildPassData(this.prisma, membershipId, this.siteUrl());
    if (!data) throw new NotFoundException('card not found');
    return data;
  }

  /** Which wallets this deployment can actually issue to. */
  availability(): { apple: boolean; google: boolean } {
    return { apple: this.apple.configured, google: this.google.configured };
  }

  /** The signed `.pkpass` bytes for one of the caller's cards. */
  async applePass(personId: string, membershipId: string): Promise<Buffer> {
    const data = await this.dataFor(personId, membershipId);
    const pass = await this.apple.issue(data, passImages(data.color));
    if (!pass) throw new ForbiddenException('Apple Wallet is not configured');
    return pass;
  }

  /**
   * A short-lived URL that serves the pass without an Authorization header.
   *
   * iOS adds a pass by opening it, and an opened URL leaves the app — so the
   * bearer token never arrives and an authenticated endpoint would just 401.
   * Carrying the grant in the URL instead keeps the whole flow inside
   * `Linking.openURL`, which matters because the alternative (downloading the
   * bytes in-app) needs native file and sharing modules, and those cannot ship
   * over an OTA update.
   *
   * Five minutes, single membership, and useless for anything else.
   */
  async appleLink(personId: string, membershipId: string): Promise<{ url: string }> {
    await this.dataFor(personId, membershipId); // ownership, before minting anything
    if (!this.apple.configured) throw new ForbiddenException('Apple Wallet is not configured');

    const token = await this.jwt.signAsync(
      { sub: personId, mid: membershipId, typ: 'apple_pass' },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: 300 },
    );
    return { url: `${this.apiBaseUrl()}/passes/apple/${token}` };
  }

  /** Redeems a link minted above. Throws unless the token is ours and current. */
  async applePassFromLink(token: string): Promise<Buffer> {
    let claims: { sub?: string; mid?: string; typ?: string };
    try {
      claims = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('this pass link has expired');
    }
    // Without the type check any access token would also mint passes.
    if (claims.typ !== 'apple_pass' || !claims.sub || !claims.mid) {
      throw new UnauthorizedException('this pass link is not valid');
    }
    return this.applePass(claims.sub, claims.mid);
  }

  /**
   * The API's public origin, version prefix included.
   *
   * `PUBLIC_API_URL` already carries `/v1` — the receipt links built in
   * TerminalService assume the same — so nothing here appends it. Adding a
   * second `/v1` produces a link that 404s only once the variable is set,
   * which is to say only in production.
   */
  private apiBaseUrl(): string {
    return this.config.get<string>('PUBLIC_API_URL') ?? 'https://api.partnerspoints.ae/v1';
  }

  /** The "Add to Google Wallet" save link for one of the caller's cards. */
  async googleSaveLink(personId: string, membershipId: string): Promise<{ url: string }> {
    const data = await this.dataFor(personId, membershipId);
    const url = this.google.saveLink(data);
    if (!url) throw new ForbiddenException('Google Wallet is not configured');
    return { url };
  }

  /**
   * Push a changed balance to a card already saved in Google Wallet.
   *
   * Called after points move. Silent when the customer never added the card,
   * and never allowed to fail the transaction that triggered it — a wallet
   * refresh is not worth losing a sale over.
   */
  async refresh(membershipId: string): Promise<{ updated: boolean }> {
    if (!this.google.configured) return { updated: false };
    const data = await buildPassData(this.prisma, membershipId, this.siteUrl());
    if (!data) return { updated: false };
    return this.google.push(data);
  }
}
