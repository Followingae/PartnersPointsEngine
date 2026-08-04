import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { EmailService } from '../../platform-core/email/email.service';
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
    private readonly email: EmailService,
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
      nationality: p.nationality,
      txnAlertsOptOut: Boolean(p.txnAlertsOptOut),
      // The sixth item on the profile checklist: where they actually go, so
      // offers from the other side of the country stop showing up.
      homeBranchId: p.homeBranchId ?? null,
      homeBranchName: p.homeBranchName ?? null,
      joinedAt: p.joinedAt,
    };
  }

  /**
   * Branches this person actually visits, busiest first.
   *
   * Only a suggestion — the app offers the top one and the customer confirms.
   * Inferring a home area from behaviour and acting on it without asking is
   * how people end up wondering why a shop they went to once now follows them
   * around.
   */
  async branchVisits(personId: string) {
    return this.call<Array<{
      branchId: string; branchName: string; brandId: string; brandName: string; visits: number;
    }>>('wallet_branch_visits', [personId]);
  }

  /**
   * Set the signed-in person's email.
   *
   * Hashed for lookup and encrypted for storage here rather than in SQL — the
   * key belongs to the application and must not be reachable from the database.
   */
  async setEmail(personId: string, email: string | null) {
    const trimmed = email?.trim() ?? '';
    if (email !== null && !/^[^@s]+@[^@s]+.[^@s]+$/.test(trimmed)) {
      throw new BadRequestException('that does not look like an email address');
    }
    const lower = trimmed.toLowerCase();
    const r = await this.call<{ ok: boolean; reason?: string }>('wallet_set_email', [
      personId,
      email === null ? null : createHash('sha256').update(lower).digest('hex'),
      email === null ? null : Buffer.from(this.crypto.encrypt(trimmed)),
    ]);
    if (!r?.ok) throw new BadRequestException(r?.reason ?? 'could not save that email');
    return this.profile(personId);
  }

  /**
   * Remember a device we can notify.
   *
   * Sending is not built yet; registering now means the day it is, everyone who
   * already granted permission is reachable without being asked again.
   */
  async registerPushToken(personId: string, token: string, platform: string) {
    if (!token.trim()) throw new BadRequestException('token required');
    await this.call('wallet_register_push_token', [personId, token.trim(), platform.slice(0, 16)]);
    return { ok: true as const };
  }

  /**
   * What's on at the brands this customer holds.
   *
   * Screens 74-76 are one hero in three treatments; an offer with an end time
   * close enough to matter gets the countdown, the rest do not. Which is a
   * rendering decision, so the app makes it — this returns the fact.
   */
  offers(personId: string) {
    return this.call<unknown[]>('wallet_offers', [personId]);
  }

  /** Set (or clear, with null) the home area. */
  async setHomeBranch(personId: string, branchId: string | null) {
    const ok = await this.call<boolean>('wallet_set_home_branch', [personId, branchId]);
    // A branch of a brand they don't hold a card for isn't theirs to claim.
    if (!ok) throw new BadRequestException('not a branch you can set as home');
    return { ok: true as const };
  }

  /**
   * Edit the signed-in person's own details.
   *
   * Each field carries an explicit "was it supplied" flag, so omitting a field
   * leaves it alone while sending `null` genuinely clears it. The previous
   * version used COALESCE for both, which meant a customer clearing their
   * birthday silently kept it — the DTO documented the opposite.
   */
  async updateProfile(
    personId: string,
    dto: {
      fullName?: string;
      gender?: string | null;
      birthdate?: string | null;
      nationality?: string | null;
      txnAlertsOptOut?: boolean;
    },
  ) {
    const has = (k: keyof typeof dto) => Object.prototype.hasOwnProperty.call(dto, k);
    await this.call(
      'wallet_update_profile',
      [
        personId,
        has('fullName'), dto.fullName?.trim() || null,
        has('gender'), dto.gender || null,
        has('birthdate'), dto.birthdate ?? null,
        has('nationality'), dto.nationality ? dto.nationality.toUpperCase() : null,
        has('txnAlertsOptOut'), dto.txnAlertsOptOut ?? false,
      ],
      [null, null, null, null, null, null, 'date', null, null, null, null],
    );
    return this.profile(personId);
  }

  /** Brands to join — what the app shows when the wallet is empty. */
  brands(personId: string) {
    return this.call<unknown[]>('wallet_discoverable_brands', [personId]);
  }

  /**
   * Join a brand from the app.
   *
   * Also registers the identifiers a till resolves against, so someone who
   * joined on their phone is recognisable in the shop straight away rather than
   * having to be enrolled again at the counter.
   */
  async joinBrand(personId: string, brandId: string) {
    const r = await this.call<{
      ok: boolean; reason?: string; membershipId?: string; loyaltyId?: string; alreadyMember?: boolean;
    }>('wallet_join_brand', [personId, brandId]);
    if (!r?.ok) throw new BadRequestException(r?.reason ?? 'could not join this brand');

    // Only on a genuinely new card — re-joining shouldn't re-welcome anyone.
    if (!r.alreadyMember) {
      void this.sendWelcome(personId, brandId, r.loyaltyId!).catch(() => undefined);
    }

    return {
      membershipId: r.membershipId!,
      loyaltyId: r.loyaltyId!,
      alreadyMember: Boolean(r.alreadyMember),
    };
  }

  /**
   * Welcomes a new cardholder by email, when we hold an address.
   *
   * Never awaited and never throws: the card exists either way, and joining
   * must not appear to fail because a mail server was slow.
   */
  private async sendWelcome(personId: string, brandId: string, loyaltyId: string): Promise<void> {
    try {
      // Inside the try, not before it: this is called without an await, so
      // anything that throws outside the guard is an unhandled rejection.
      if (!this.email.configured) return;
      const profile = await this.profile(personId);
      if (!profile.email?.includes('@')) return;
      const brands = (await this.brands(personId)) as Array<{ brandId: string; brandName: string; pointsCode: string }>;
      const brand = brands.find((b) => b.brandId === brandId);
      if (!brand) return;
      await this.email.sendWelcome(profile.email, {
        brandName: brand.brandName,
        pointsCode: brand.pointsCode,
        appUrl: process.env.APP_URL ?? 'https://partnerspoints.ae',
        loyaltyId,
      });
    } catch {
      // Intentionally silent — see the doc comment.
    }
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

  /**
   * Devices signed in to this wallet.
   *
   * One active refresh token is one device: rotation revokes the old row as it
   * writes the new, so there is never more than one live token per device. The
   * user-agent is turned into a device name here rather than in SQL — it is
   * presentation, and a new phone shouldn't need a migration to read properly.
   */
  async sessions(personId: string, currentSessionId: string | null) {
    const rows = await this.call<WalletSessionRow[]>('wallet_sessions', [personId]);
    return rows.map((r) => ({
      id: r.id,
      device: deviceName(r.userAgent),
      current: currentSessionId !== null && r.id === currentSessionId,
      signedInAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      expiresAt: r.expiresAt,
    }));
  }

  /** Revoking a session that isn't yours (or isn't live) is a 404, not a 403. */
  async revokeSession(personId: string, sessionId: string) {
    const ok = await this.call<boolean>('wallet_revoke_session', [personId, sessionId]);
    if (!ok) throw new NotFoundException('session not found');
    return { ok: true as const };
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

interface WalletSessionRow {
  id: string;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/**
 * A user-agent turned into something someone would recognise as their phone.
 *
 * Expo sends the OS and version, which is the useful half; a browser sends a
 * long string whose only reliable part is the platform. Anything unparseable
 * says so plainly rather than being labelled with a guess — "Unknown device"
 * is a worse answer to read but a better one to act on.
 */
function deviceName(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const ios = /iPhone(?: OS (\d+))?|CPU iPhone OS (\d+)/.exec(ua);
  if (ios) {
    const v = ios[1] ?? ios[2];
    return v ? `iPhone · iOS ${v}` : 'iPhone';
  }
  if (/iPad/.test(ua)) return 'iPad';
  const android = /Android[ /](\d+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/okhttp|Dart|Expo/i.test(ua)) return 'Partners Points app';
  return 'Unknown device';
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
  homeBranchId?: string | null;
  homeBranchName?: string | null;
  id: string;
  fullName: string | null;
  gender: string | null;
  birthdate: string | null;
  nationality: string | null;
  txnAlertsOptOut: boolean;
  joinedAt: string;
  phoneEnc: string | null;
  emailEnc: string | null;
}
