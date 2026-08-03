import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PassData } from './pass-data';

/**
 * Google Wallet loyalty passes.
 *
 * Two halves. Issuing is a signed JWT the phone opens as a save link — no
 * network call needed, so a customer can add a card even if our API is slow.
 * Updating is an authenticated PATCH on the object, which is why Google is a
 * fraction of Apple's cost: no re-signing, no push infrastructure, no device
 * bookkeeping.
 *
 * Requires:
 *   GOOGLE_WALLET_ISSUER_ID          from the Google Pay & Wallet Console
 *   GOOGLE_WALLET_SA_EMAIL           service account address
 *   GOOGLE_WALLET_SA_PRIVATE_KEY     its PEM private key
 *
 * Unconfigured, every method reports it rather than throwing — a brand without
 * wallet passes should still function.
 */
@Injectable()
export class GoogleWalletService {
  private readonly logger = new Logger(GoogleWalletService.name);
  private static readonly BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_WALLET_ISSUER_ID') &&
      this.config.get<string>('GOOGLE_WALLET_SA_EMAIL') &&
      this.config.get<string>('GOOGLE_WALLET_SA_PRIVATE_KEY'),
    );
  }

  private get issuerId(): string {
    return this.config.getOrThrow<string>('GOOGLE_WALLET_ISSUER_ID');
  }

  /** Newlines survive env vars badly; accept the escaped form too. */
  private get privateKey(): string {
    return this.config.getOrThrow<string>('GOOGLE_WALLET_SA_PRIVATE_KEY').replace(/\\n/g, '\n');
  }

  /** One class per brand — the template every member's card is stamped from. */
  classId(brandId: string): string {
    return `${this.issuerId}.brand_${brandId.replace(/-/g, '')}`;
  }

  /** One object per membership. Stable, so re-saving overwrites in place. */
  objectId(membershipId: string): string {
    return `${this.issuerId}.mem_${membershipId.replace(/-/g, '')}`;
  }

  private loyaltyClass(d: PassData): Record<string, unknown> {
    return {
      id: this.classId(d.brandId),
      issuerName: d.brandName,
      programName: d.brandName,
      reviewStatus: 'UNDER_REVIEW',
      hexBackgroundColor: d.color,
      // Left deliberately off: Smart Tap needs a certified terminal and a
      // collector id, neither of which we hold. The barcode is the identifier.
      enableSmartTap: false,
      linksModuleData: {
        uris: [{ uri: d.siteUrl, description: 'Partners Points' }],
      },
    };
  }

  private loyaltyObject(d: PassData): Record<string, unknown> {
    const object: Record<string, unknown> = {
      id: this.objectId(d.membershipId),
      classId: this.classId(d.brandId),
      state: 'ACTIVE',
      accountId: d.loyaltyId,
      accountName: d.brandName,
      barcode: { type: 'QR_CODE', value: d.memberToken, alternateText: d.loyaltyId },
      loyaltyPoints: {
        label: d.pointsCode,
        balance: { string: Number(d.balance).toLocaleString('en-US') },
      },
    };

    // A stamp card reads as progress, not as a number — put it where the eye
    // lands rather than burying it in a detail row.
    if (d.stamps) {
      object.secondaryLoyaltyPoints = {
        label: d.stamps.rewardName ?? 'Stamps',
        balance: { string: `${d.stamps.collected} / ${d.stamps.target}` },
      };
    }
    if (d.tier) {
      object.textModulesData = [{ header: 'Tier', body: d.tier, id: 'tier' }];
    }
    return object;
  }

  /**
   * The "Add to Google Wallet" link.
   *
   * Class and object travel inside the JWT, so Google creates both on first
   * save and we make no API call to issue. Updates go through `push` below.
   */
  saveLink(d: PassData): string | null {
    if (!this.configured) {
      this.logger.warn('Google Wallet not configured — no save link issued');
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.config.getOrThrow<string>('GOOGLE_WALLET_SA_EMAIL'),
      aud: 'google',
      typ: 'savetowallet',
      iat: now,
      origins: [d.siteUrl],
      payload: {
        loyaltyClasses: [this.loyaltyClass(d)],
        loyaltyObjects: [this.loyaltyObject(d)],
      },
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${b64(header)}.${b64(claims)}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(this.privateKey, 'base64url');

    return `https://pay.google.com/gp/v/save/${signingInput}.${signature}`;
  }

  /**
   * Push a changed balance to a card already in someone's wallet.
   *
   * PATCH rather than update: a partial write can't clobber fields Google owns
   * (or that a later version of this code adds).
   */
  async push(d: PassData): Promise<{ updated: boolean }> {
    if (!this.configured) return { updated: false };
    try {
      const token = await this.accessToken();
      if (!token) return { updated: false };

      const res = await fetch(`${GoogleWalletService.BASE}/loyaltyObject/${this.objectId(d.membershipId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.loyaltyObject(d)),
      });
      // 404 is expected and not an error: the customer simply hasn't added the
      // card to their wallet, so there is nothing to update.
      if (res.status === 404) return { updated: false };
      if (!res.ok) {
        this.logger.error(`Google Wallet PATCH failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
        return { updated: false };
      }
      return { updated: true };
    } catch (e) {
      this.logger.error(`Google Wallet unreachable: ${(e as Error).message}`);
      return { updated: false };
    }
  }

  /** Service-account access token via the JWT bearer grant. */
  private async accessToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.config.getOrThrow<string>('GOOGLE_WALLET_SA_EMAIL'),
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
    const assertion = `${input}.${createSign('RSA-SHA256').update(input).sign(this.privateKey, 'base64url')}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      this.logger.error(`Google token exchange failed (${res.status})`);
      return null;
    }
    return ((await res.json()) as { access_token?: string }).access_token ?? null;
  }
}
