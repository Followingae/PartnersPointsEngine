import { Injectable, NotFoundException } from '@nestjs/common';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { PrismaService } from '../../platform-core/prisma/prisma.service';
import { buildCustomerActivity } from '../loyalty-rules/customer-activity';

/**
 * The customer app's wallet: everything a person holds, across every brand.
 *
 * Loyalty data is isolated by brand, so a person-level read has no tenant
 * context to run under. These queries therefore go through the wallet_*
 * SECURITY DEFINER functions, which take a person id and cannot be steered to
 * another person's rows.
 */
@Injectable()
export class CustomerWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EnvelopeCryptoService,
  ) {}

  /**
   * Calls one of the wallet_* definer functions.
   *
   * `casts` matters: Prisma sends JS numbers as bigint, which doesn't match an
   * `int` parameter and fails to resolve the overload, so numeric arguments
   * name their SQL type here.
   */
  private async call<T>(fn: string, args: unknown[], casts: (string | null)[] = []): Promise<T> {
    const placeholders = args
      .map((_, i) => (casts[i] ? `$${i + 1}::${casts[i]}` : `$${i + 1}`))
      .join(', ');
    const rows = await this.prisma.$queryRawUnsafe<{ result: T }[]>(
      `SELECT ${fn}(${placeholders}) AS result`,
      ...args,
    );
    return rows[0]!.result;
  }

  /** Every card in the wallet, with live balance and tier progress. */
  async cards(personId: string) {
    const cards = await this.call<WalletCard[]>('wallet_cards', [personId]);
    return (cards ?? []).map((c) => {
      const lifetime = Number(c.lifetime ?? '0');
      const floor = Number(c.tierThreshold ?? '0');
      const next = c.nextTierThreshold != null ? Number(c.nextTierThreshold) : null;
      const progressPct = next != null && next > floor
        ? Math.min(100, Math.round(((lifetime - floor) * 100) / (next - floor)))
        : 100;
      return {
        ...c,
        progressPct,
        toNextTier: next != null ? Math.max(0, next - lifetime).toString() : null,
      };
    });
  }

  /** Rewards held across all brands, newest first. */
  vouchers(personId: string) {
    return this.call<WalletVoucher[]>('wallet_vouchers', [personId]);
  }

  /**
   * One timeline across every brand: points movements from the ledger merged
   * with reward events, which leave almost no ledger trace of their own.
   */
  async activity(personId: string, limit = 60) {
    const [journals, vouchers] = await Promise.all([
      this.call<WalletJournal[]>('wallet_activity', [personId, limit], [null, 'int']),
      this.vouchers(personId),
    ]);
    return buildCustomerActivity({
      journals: (journals ?? []).map((j) => ({
        id: j.journalId,
        kind: j.kind,
        direction: j.direction,
        amountMinor: BigInt(j.amount),
        occurredAt: new Date(j.occurredAt),
        brandId: j.brandId,
        brandName: j.brandName,
      })),
      vouchers: (vouchers ?? []).map((v) => ({
        id: v.id,
        code: v.code,
        status: v.status,
        createdAt: new Date(v.issuedAt),
        redeemedAt: v.redeemedAt ? new Date(v.redeemedAt) : null,
        expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
        pointsSpent: BigInt(v.pointsSpent ?? '0'),
        // The wallet view doesn't carry the paying journal, so an issue event is
        // always emitted; the ledger row beside it reads as the points movement.
        redeemJournalId: null,
        rewardName: v.rewardName,
        brandId: v.brandId,
        brandName: v.brandName,
      })),
      limit,
    });
  }

  async profile(personId: string) {
    const p = await this.call<WalletProfile | null>('wallet_profile', [personId]);
    if (!p) throw new NotFoundException('profile not found');
    return {
      id: p.id,
      fullName: p.fullName,
      phone: this.reveal(p.phoneEnc),
      email: this.reveal(p.emailEnc),
      gender: p.gender,
      birthdate: p.birthdate,
      joinedAt: p.joinedAt,
    };
  }

  async updateProfile(
    personId: string,
    dto: { fullName?: string; gender?: string; birthdate?: string | null },
  ) {
    await this.call(
      'wallet_update_profile',
      [personId, dto.fullName?.trim() || null, dto.gender || null, dto.birthdate ?? null],
      [null, null, null, 'date'],
    );
    return this.profile(personId);
  }

  /** Brands to join — what the app shows when the wallet is empty. */
  brands(personId: string) {
    return this.call<unknown[]>('wallet_discoverable_brands', [personId]);
  }

  /**
   * The value the app renders as a QR at the till.
   *
   * Registering it as an identifier is what makes the terminal able to resolve
   * it — scanning alone doesn't help if nothing on the server matches the hash.
   */
  async scanCode(personId: string, brandId: string) {
    const r = await this.call<{ value: string; loyaltyId: string; membershipId: string } | null>(
      'wallet_scan_code',
      [personId, brandId],
    );
    if (!r) throw new NotFoundException('card not found');
    return r;
  }

  /** Contact details are stored encrypted; decrypt for the owner only. */
  private reveal(b64: string | null): string | null {
    if (!b64) return null;
    try {
      return this.crypto.decrypt(Buffer.from(b64, 'base64'));
    } catch {
      return null;
    }
  }
}

interface WalletCard {
  membershipId: string;
  brandId: string;
  brandName: string;
  available: string;
  lifetime: string;
  tierThreshold: string | null;
  nextTierThreshold: string | null;
}

interface WalletVoucher {
  id: string;
  code: string;
  status: string;
  brandId: string;
  brandName: string;
  rewardName: string;
  pointsSpent: string;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
}

interface WalletJournal {
  journalId: string;
  kind: string;
  direction: string;
  amount: string;
  occurredAt: string;
  brandId: string;
  brandName: string;
}

interface WalletProfile {
  id: string;
  fullName: string | null;
  gender: string | null;
  birthdate: string | null;
  joinedAt: string;
  phoneEnc: string | null;
  emailEnc: string | null;
}
