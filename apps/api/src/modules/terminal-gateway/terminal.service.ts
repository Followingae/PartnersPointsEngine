import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger, type Prisma } from '@rfm-loyalty/db';
import { EarnRule, evaluateEarn, type CustomerIdentifierType, type TenantContext } from '@rfm-loyalty/shared';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { TokenService, type MemberTokenClaims } from '../../auth/tokens/token.service';
import { EmailService } from '../../platform-core/email/email.service';
import type { ReceiptEmailData } from '../../platform-core/email/email.templates';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { LoyaltyService, redemptionValueMinor, scheduleContext } from '../loyalty-rules/loyalty.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface TxnInput {
  intent: 'earn' | 'redeem';
  memberToken: string;
  idempotencyKey: string;
  amountMinor?: number;
  items?: Array<{ sku: string; qty: number }>;
  isVisit?: boolean;
  points?: number;
  sourceEvent?: string;
}

function mapTxn(t: {
  id: string;
  intent: string;
  state: string;
  points: bigint | null;
  amountMinor: bigint | null;
  authJournalId: string | null;
  captureJournalId: string | null;
}) {
  return {
    id: t.id,
    intent: t.intent,
    state: t.state,
    points: t.points?.toString() ?? null,
    amountMinor: t.amountMinor?.toString() ?? null,
    authJournalId: t.authJournalId,
    captureJournalId: t.captureJournalId,
  };
}

@Injectable()
export class TerminalService {
  constructor(
    private readonly tenants: TenantService,
    private readonly tokens: TokenService,
    private readonly loyalty: LoyaltyService,
    private readonly crypto: EnvelopeCryptoService,
    /** Optional so the ledger tests can build this service without a mailer. */
    private readonly email?: EmailService,
  ) {}

  /**
   * How long a reward stays held for a sale in progress. Long enough to cover a
   * card being re-presented or a receipt reprint, short enough that a walked-away
   * customer isn't locked out of their own reward for the rest of the day.
   */
  private static readonly VOUCHER_HOLD_MS = 15 * 60 * 1000;

  private reservationExpired(reservedAt: Date | null | undefined): boolean {
    if (!reservedAt) return true;
    return Date.now() - reservedAt.getTime() > TerminalService.VOUCHER_HOLD_MS;
  }

  /** Return lapsed holds to the customer — an abandoned sale spends nothing. */
  private async releaseStaleHolds(tx: Prisma.TransactionClient, brandId: string, membershipId?: string): Promise<void> {
    await tx.voucher.updateMany({
      where: {
        brandId,
        ...(membershipId ? { membershipId } : {}),
        status: 'reserved',
        reservedAt: { lt: new Date(Date.now() - TerminalService.VOUCHER_HOLD_MS) },
      },
      data: { status: 'issued', reservedAt: null },
    });
  }

  /**
   * A sale captured, so the rewards held against it are genuinely spent. Called
   * from the capture paths rather than at the moment the cashier taps "use".
   */
  private async confirmVoucherHolds(tx: Prisma.TransactionClient, brandId: string, membershipId: string): Promise<void> {
    await tx.voucher.updateMany({
      where: {
        brandId,
        membershipId,
        status: 'reserved',
        reservedAt: { gte: new Date(Date.now() - TerminalService.VOUCHER_HOLD_MS) },
      },
      data: { status: 'redeemed', redeemedAt: new Date() },
    });
  }

  private async member(memberToken: string, ctx: TenantContext): Promise<MemberTokenClaims> {
    let claims: MemberTokenClaims;
    try {
      claims = await this.tokens.verifyMemberToken(memberToken);
    } catch {
      throw new BadRequestException('invalid or expired member token');
    }
    if (claims.brandId !== ctx.brandId) throw new BadRequestException('member token brand mismatch');
    return claims;
  }

  /** Identifier (phone/qr/nfc/loyalty_id) → opaque short-lived member token. */
  async resolve(ctx: TenantContext, type: CustomerIdentifierType, value: string) {
    return this.tenants.run(ctx, async (tx) => {
      const ident = await tx.customerIdentifier.findUnique({
        where: { brandId_type_valueHash: { brandId: ctx.brandId!, type, valueHash: sha256(value) } },
        select: { membershipId: true },
      });
      if (!ident) throw new NotFoundException('member not found');
      const memberToken = await this.tokens.issueMemberToken({
        membershipId: ident.membershipId,
        brandId: ctx.brandId!,
        groupId: ctx.groupId!,
        platformId: ctx.platformId,
      });
      return { memberToken };
    });
  }

  /**
   * Terminal boot config: brand identity + the redemption valuation every POS
   * surface must agree on. Cached client-side; re-fetched on each app start.
   */
  async config(ctx: TenantContext) {
    const redemption = await this.loyalty.getRedemptionConfig(ctx);
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({
        where: { id: ctx.brandId! },
        select: { name: true, currency: true, pointsCurrencyCode: true, branding: true },
      });
      const terminal = ctx.actor.type === 'terminal'
        ? await tx.terminal.findFirst({ where: { id: ctx.actor.id }, select: { label: true, branch: { select: { name: true } } } })
        : null;
      return {
        brand: {
          name: brand?.name ?? '',
          currency: brand?.currency ?? 'AED',
          pointsCurrencyCode: brand?.pointsCurrencyCode ?? 'PTS',
          branding: (brand?.branding ?? {}) as Record<string, unknown>,
        },
        terminal: terminal ? { label: terminal.label, branchName: terminal.branch.name } : null,
        redemption,
      };
    });
  }

  /**
   * At-till enrollment: get-or-create the person (via SECURITY DEFINER — person
   * is platform-scoped) and attach a membership + phone identifier for this
   * brand. Idempotent: an already-enrolled phone just resolves. The customer
   * completes their profile later in the Partners Points app.
   */
  async enroll(ctx: TenantContext, dto: { phone: string; fullName?: string }) {
    const phone = dto.phone.trim();
    if (!/^\+[0-9]{8,15}$/.test(phone)) throw new BadRequestException('phone must be E.164 (+9715xxxxxxxx)');
    const valueHash = sha256(phone);
    const phoneEnc = Buffer.from(this.crypto.encrypt(phone));
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.customerIdentifier.findUnique({
        where: { brandId_type_valueHash: { brandId: ctx.brandId!, type: 'phone', valueHash } },
        select: { membershipId: true },
      });
      let membershipId: string;
      let created = false;
      if (existing) {
        membershipId = existing.membershipId;
      } else {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT terminal_enroll_person(${ctx.platformId}, ${valueHash}, ${phoneEnc}, ${dto.fullName ?? null}) AS id`;
        const personId = rows[0]!.id;
        const membership = await tx.customerMembership.upsert({
          where: { personId_brandId: { personId, brandId: ctx.brandId! } },
          update: {},
          create: {
            personId,
            brandId: ctx.brandId!,
            groupId: ctx.groupId!,
            platformId: ctx.platformId,
            loyaltyId: `PP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`,
          },
          select: { id: true },
        });
        membershipId = membership.id;
        await tx.customerIdentifier.create({
          data: { membershipId, brandId: ctx.brandId!, groupId: ctx.groupId!, platformId: ctx.platformId, type: 'phone', valueHash },
        });
        created = true;
      }
      const memberToken = await this.tokens.issueMemberToken({
        membershipId,
        brandId: ctx.brandId!,
        groupId: ctx.groupId!,
        platformId: ctx.platformId,
      });
      return { memberToken, created };
    });
  }

  /**
   * Persist an eReceipt (public-by-token; the printed QR links to it). Token is
   * client-generated so the paper QR is valid even when this call replays from
   * the offline outbox. Idempotent by token.
   */
  async createReceipt(
    ctx: TenantContext,
    dto: {
      token: string;
      kind?: string;
      orderNo: string;
      grossMinor?: number;
      discountMinor?: number;
      netMinor?: number;
      currency?: string;
      paymentMethod?: string;
      maskedPan?: string;
      authNo?: string;
      memberName?: string;
      earnedPoints?: number;
      redeemedPoints?: number;
      balanceAfter?: number;
      pointsCode?: string;
      memberToken?: string;
    },
  ) {
    // Which rewards were applied to this sale is something the server already
    // knows — they are the ones held for this member — so the till doesn't have
    // to tell us, and older terminals still get them onto the receipt.
    const claims = dto.memberToken ? await this.member(dto.memberToken, ctx) : null;
    return this.tenants.run(ctx, async (tx) => {
      const brand = await tx.brand.findFirst({ where: { id: ctx.brandId! }, select: { name: true, branding: true } });
      const branding = (brand?.branding ?? {}) as { primaryColor?: string };
      const existing = await tx.receipt.findUnique({ where: { token: dto.token }, select: { id: true } });
      if (existing) return { id: existing.id, token: dto.token };

      const applied = claims
        ? await tx.voucher.findMany({
            where: {
              brandId: ctx.brandId!,
              membershipId: claims.membershipId,
              status: { in: ['reserved', 'redeemed'] },
              OR: [
                { reservedAt: { gte: new Date(Date.now() - TerminalService.VOUCHER_HOLD_MS) } },
                { redeemedAt: { gte: new Date(Date.now() - TerminalService.VOUCHER_HOLD_MS) } },
              ],
            },
            select: { code: true, catalogItem: { select: { name: true, payload: true } } },
          })
        : [];
      const vouchers = applied.map((v) => {
        const payload = (v.catalogItem?.payload ?? {}) as { discountMinor?: number };
        return {
          code: v.code,
          rewardName: v.catalogItem?.name ?? 'Reward',
          discountMinor: typeof payload.discountMinor === 'number' ? payload.discountMinor : 0,
        };
      });
      const r = await tx.receipt.create({
        data: {
          token: dto.token,
          brandId: ctx.brandId!,
          groupId: ctx.groupId!,
          platformId: ctx.platformId,
          terminalId: ctx.actor.type === 'terminal' ? ctx.actor.id : null,
          brandName: brand?.name ?? 'Partners Points',
          brandColor: branding.primaryColor ?? null,
          kind: dto.kind ?? 'sale',
          orderNo: dto.orderNo,
          grossMinor: BigInt(dto.grossMinor ?? 0),
          discountMinor: BigInt(dto.discountMinor ?? 0),
          netMinor: BigInt(dto.netMinor ?? 0),
          currency: dto.currency ?? 'AED',
          paymentMethod: dto.paymentMethod ?? 'card',
          maskedPan: dto.maskedPan ?? null,
          authNo: dto.authNo ?? null,
          memberName: dto.memberName ?? null,
          earnedPoints: BigInt(dto.earnedPoints ?? 0),
          redeemedPoints: BigInt(dto.redeemedPoints ?? 0),
          balanceAfter: dto.balanceAfter != null ? BigInt(dto.balanceAfter) : null,
          pointsCode: dto.pointsCode ?? 'PTS',
          membershipId: claims?.membershipId ?? null,
          vouchers,
        },
        select: { id: true },
      });

      // Email the receipt if we hold an address. Deliberately not awaited into
      // the result: the sale is already done and a mail failure must not make
      // the till think the receipt wasn't stored.
      void this.emailReceipt(tx, claims?.membershipId, {
        brandName: brand?.name ?? 'Partners Points',
        orderNo: dto.orderNo,
        currency: dto.currency ?? 'AED',
        grossMinor: dto.grossMinor ?? 0,
        discountMinor: dto.discountMinor ?? 0,
        netMinor: dto.netMinor ?? 0,
        earnedPoints: dto.earnedPoints ?? 0,
        balanceAfter: dto.balanceAfter ?? null,
        pointsCode: dto.pointsCode ?? 'PTS',
        memberName: dto.memberName ?? null,
        vouchers,
        receiptUrl: `${this.publicBaseUrl()}/r/${dto.token}`,
      });

      return { id: r.id, token: dto.token };
    });
  }

  /** Where the customer-facing receipt page lives. */
  private publicBaseUrl(): string {
    return process.env.PUBLIC_API_URL ?? 'https://api.partnerspoints.ae/v1';
  }

  /**
   * Sends the receipt to the member's address, when there is one.
   *
   * Swallows everything: an email accompanies a sale that has already happened,
   * so no failure here should ever surface at the till.
   */
  private async emailReceipt(
    tx: Prisma.TransactionClient,
    membershipId: string | undefined,
    data: Omit<ReceiptEmailData, 'memberName'> & { memberName: string | null },
  ): Promise<void> {
    if (!membershipId || !this.email?.configured) return;
    try {
      const m = await tx.customerMembership.findUnique({
        where: { id: membershipId },
        select: { person: { select: { emailEnc: true } } },
      });
      const enc = m?.person?.emailEnc;
      if (!enc) return;
      const address = this.crypto.decrypt(Buffer.from(enc));
      if (!address.includes('@')) return;
      await this.email.sendReceipt(address, { ...data, memberName: data.memberName ?? undefined });
    } catch {
      // Intentionally silent — see the doc comment.
    }
  }

  /**
   * The identified customer's usable vouchers, so the cashier can see and tap
   * what they hold instead of needing the code read out.
   */
  async memberVouchers(ctx: TenantContext, memberToken: string) {
    const claims = await this.member(memberToken, ctx);
    return this.tenants.run(ctx, async (tx) => {
      // Rewards held by a sale that was never completed belong to the customer
      // again — hand them back before deciding what to show the cashier.
      await this.releaseStaleHolds(tx, ctx.brandId!, claims.membershipId);
      const rows = await tx.voucher.findMany({
        where: {
          membershipId: claims.membershipId,
          brandId: ctx.brandId!,
          status: 'issued',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          code: true, expiresAt: true, createdAt: true,
          catalogItem: { select: { name: true, kind: true, payload: true } },
        },
      });
      return rows.map((v) => {
        const payload = (v.catalogItem?.payload ?? {}) as { discountMinor?: number };
        return {
          code: v.code,
          rewardName: v.catalogItem?.name ?? 'Reward',
          kind: v.catalogItem?.kind ?? 'voucher',
          discountMinor: typeof payload.discountMinor === 'number' ? payload.discountMinor : 0,
          expiresAt: v.expiresAt,
        };
      });
    });
  }

  /**
   * Redeem a reward voucher at the till (the customer shows a code/QR from the
   * app or a printed slip). Returns what the cashier must hand over, and the
   * money value when the reward is a discount.
   */
  async redeemVoucher(ctx: TenantContext, code: string, memberToken?: string) {
    const normalized = code.trim().toUpperCase();
    return this.tenants.run(ctx, async (tx) => {
      const v = await tx.voucher.findUnique({
        where: { code: normalized },
        include: { catalogItem: { select: { name: true, kind: true, payload: true } } },
      });
      if (!v || v.brandId !== ctx.brandId) throw new NotFoundException('voucher not found');
      if (v.expiresAt && v.expiresAt < new Date()) {
        await tx.voucher.update({ where: { id: v.id }, data: { status: 'expired' } });
        throw new BadRequestException('This voucher has expired');
      }
      if (v.status === 'redeemed') throw new BadRequestException('This voucher was already used');
      // A stale hold from an abandoned sale is not a real claim on the voucher.
      const heldElsewhere = v.status === 'reserved' && !this.reservationExpired(v.reservedAt);
      if (heldElsewhere) throw new BadRequestException('This voucher was already used on a sale in progress');
      if (v.status !== 'issued' && v.status !== 'reserved') {
        throw new BadRequestException(`This voucher is ${v.status}`);
      }

      // If the cashier already identified the member, make sure it's their voucher.
      if (memberToken) {
        const claims = await this.member(memberToken, ctx);
        if (claims.membershipId !== v.membershipId) {
          throw new BadRequestException('This voucher belongs to a different member');
        }
      }

      // Rewards don't stack: one per sale. A live hold on any other voucher for
      // this member means a reward is already on the bill.
      const otherHold = await tx.voucher.findFirst({
        where: {
          brandId: ctx.brandId!,
          membershipId: v.membershipId,
          status: 'reserved',
          id: { not: v.id },
          reservedAt: { gte: new Date(Date.now() - TerminalService.VOUCHER_HOLD_MS) },
        },
        select: { catalogItem: { select: { name: true } } },
      });
      if (otherHold) {
        throw new BadRequestException(
          `Only one reward can be used per sale — ${otherHold.catalogItem?.name ?? 'a reward'} is already applied`,
        );
      }

      // Hold, don't burn. The reward is only spent once a sale captures against
      // it (confirmVoucherHolds); abandon the sale and the hold lapses.
      await tx.voucher.update({ where: { id: v.id }, data: { status: 'reserved', reservedAt: new Date() } });
      const payload = (v.catalogItem?.payload ?? {}) as { discountMinor?: number };
      return {
        code: v.code,
        // Applied to this sale, not yet spent — it is spent when the sale captures.
        status: 'reserved',
        rewardName: v.catalogItem?.name ?? 'Reward',
        kind: v.catalogItem?.kind ?? 'voucher',
        discountMinor: typeof payload.discountMinor === 'number' ? payload.discountMinor : 0,
      };
    });
  }

  /** Member snapshot for the cashier-facing recognition screen. */
  async memberContext(ctx: TenantContext, memberToken: string) {
    const claims = await this.member(memberToken, ctx);
    const bal = await this.loyalty.balance(ctx, claims.membershipId);
    return this.tenants.run(ctx, async (tx) => {
      const m = await tx.customerMembership.findFirst({
        where: { id: claims.membershipId, brandId: ctx.brandId! },
        select: { loyaltyId: true, joinedAt: true, person: { select: { fullName: true } } },
      });
      if (!m) throw new NotFoundException('member not found');
      return {
        displayName: m.person.fullName ?? 'Member',
        loyaltyId: m.loyaltyId,
        tier: bal.tier?.name ?? null,
        balance: { active: bal.available, available: bal.available, pending: bal.pending, lifetime: bal.lifetime },
        joinedAt: m.joinedAt,
      };
    });
  }

  /** Preview earn/redeem for a cart without mutating the ledger. */
  async quote(ctx: TenantContext, dto: { memberToken: string; amountMinor?: number; items?: Array<{ sku: string; qty: number }>; isVisit?: boolean; redeemPoints?: number }) {
    const claims = await this.member(dto.memberToken, ctx);
    return this.tenants.run(ctx, async (tx) => {
      const ruleRows = await tx.loyaltyEarnRule.findMany({ where: { brandId: ctx.brandId!, enabled: true }, orderBy: { priority: 'asc' } });
      const rules: EarnRule[] = ruleRows.map((r) => {
        const def = (r.definition ?? {}) as { condition?: unknown; actions?: unknown; channel?: 'online' | 'in_store' };
        return EarnRule.parse({ id: r.id, name: r.name, priority: r.priority, enabled: r.enabled, channel: def.channel, condition: def.condition, actions: def.actions ?? [] });
      });
      const decision = evaluateEarn(rules, { session: { amountMinor: dto.amountMinor, isVisit: dto.isVisit, channel: 'in_store', ...scheduleContext() }, items: dto.items });

      let redeem:
        | { points: number; affordable: boolean; valueMinor: string; belowMinimum: boolean }
        | undefined;
      if (dto.redeemPoints && dto.redeemPoints > 0) {
        const [bal, cfg] = await Promise.all([
          this.loyalty.balance(ctx, claims.membershipId),
          this.loyalty.getRedemptionConfig(ctx),
        ]);
        const value = redemptionValueMinor(
          cfg,
          BigInt(dto.redeemPoints),
          dto.amountMinor != null ? BigInt(dto.amountMinor) : undefined,
        );
        redeem = {
          points: dto.redeemPoints,
          affordable: BigInt(bal.available) >= BigInt(dto.redeemPoints),
          valueMinor: value.toString(),
          belowMinimum: BigInt(dto.redeemPoints) < BigInt(cfg.minRedeemPoints),
        };
      }
      return { earn: { points: decision.points, base: decision.base, multiplier: decision.multiplier }, redeem };
    });
  }

  /** Earn (single-step capture) or redeem (authorize hold). Idempotent per (terminal, key). */
  async transaction(ctx: TenantContext, dto: TxnInput) {
    const claims = await this.member(dto.memberToken, ctx);
    return this.tenants.run(ctx, async (tx) => {
      const existing = await tx.terminalTransaction.findUnique({
        where: { actorId_idempotencyKey: { actorId: ctx.actor.id, idempotencyKey: dto.idempotencyKey } },
      });
      if (existing) return mapTxn(existing);

      if (dto.intent === 'earn') {
        const r = await this.loyalty.earnWithTx(tx, ctx, {
          membershipId: claims.membershipId,
          amountMinor: dto.amountMinor,
          items: dto.items,
          isVisit: dto.isVisit,
          channel: 'in_store',
          sourceEvent: dto.sourceEvent,
          idempotencyKey: `term:${dto.idempotencyKey}`,
        });
        // An earn-only sale still completes a sale, so it confirms any held rewards.
        await this.confirmVoucherHolds(tx, ctx.brandId!, claims.membershipId);
        const created = await tx.terminalTransaction.create({
          data: {
            ...this.scopeData(ctx, claims.membershipId, dto.idempotencyKey),
            intent: 'earn',
            state: 'captured',
            amountMinor: dto.amountMinor != null ? BigInt(dto.amountMinor) : null,
            points: BigInt(r.decision.points),
            captureJournalId: r.journalId,
            sourceEvent: dto.sourceEvent ?? null,
          },
        });
        // Hand the till everything worth celebrating + printing on the slip.
        return {
          ...mapTxn(created),
          completed: r.gamification.completed ?? [],
          stamps: r.gamification.stamps ?? [],
        };
      }

      // redeem → authorize a hold (captured later)
      if (!dto.points || dto.points <= 0) throw new BadRequestException('redeem requires points > 0');
      const auth = await ledger.authorizeRedeem(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: claims.membershipId },
        points: BigInt(dto.points),
        occurredAt: new Date(),
        sourceEvent: dto.sourceEvent,
        channel: 'in_store',
        idem: { actorId: ctx.actor.id, key: `term:${dto.idempotencyKey}:auth` },
      }).catch((e) => {
        if (e instanceof ledger.LedgerError && e.code === 'insufficient_balance') throw new BadRequestException('insufficient points');
        throw e;
      });
      const created = await tx.terminalTransaction.create({
        data: {
          ...this.scopeData(ctx, claims.membershipId, dto.idempotencyKey),
          intent: 'redeem',
          state: 'authorized',
          points: BigInt(dto.points),
          authJournalId: auth.journalId,
          sourceEvent: dto.sourceEvent ?? null,
        },
      });
      return mapTxn(created);
    });
  }

  async capture(ctx: TenantContext, txnId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.terminalTransaction.findFirst({ where: { id: txnId, brandId: ctx.brandId! } });
      if (!t) throw new NotFoundException('transaction not found');
      if (t.intent !== 'redeem' || t.state !== 'authorized' || !t.membershipId || !t.points) {
        throw new BadRequestException(`cannot capture in state ${t.state}`);
      }
      const cap = await ledger.captureRedeem(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: t.membershipId },
        points: t.points,
        occurredAt: new Date(),
        sourceEvent: t.sourceEvent ?? undefined,
        channel: 'in_store',
        idem: { actorId: ctx.actor.id, key: `term:${t.idempotencyKey}:cap` },
      });
      const updated = await tx.terminalTransaction.update({
        where: { id: t.id },
        data: { state: 'captured', captureJournalId: cap.journalId },
      });
      // The sale is real, so any rewards held for it are now genuinely spent.
      await this.confirmVoucherHolds(tx, ctx.brandId!, t.membershipId);
      // NOTE: group-wallet drawdown settlement is performed by a group-scoped
      // settlement worker (Phase 5) — the terminal context is brand-scoped.
      return mapTxn(updated);
    });
  }

  async voidTxn(ctx: TenantContext, txnId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.terminalTransaction.findFirst({ where: { id: txnId, brandId: ctx.brandId! } });
      if (!t) throw new NotFoundException('transaction not found');
      if (t.intent !== 'redeem' || t.state !== 'authorized' || !t.membershipId || !t.points) {
        throw new BadRequestException(`cannot void in state ${t.state}`);
      }
      await ledger.voidRedeem(tx, {
        scope: { platformId: ctx.platformId, groupId: ctx.groupId!, brandId: ctx.brandId!, customerId: t.membershipId },
        points: t.points,
        occurredAt: new Date(),
        idem: { actorId: ctx.actor.id, key: `term:${t.idempotencyKey}:void` },
      });
      const updated = await tx.terminalTransaction.update({ where: { id: t.id }, data: { state: 'voided' } });
      // Sale abandoned — hand the customer their rewards back immediately
      // rather than making them wait out the hold.
      await tx.voucher.updateMany({
        where: { brandId: ctx.brandId!, membershipId: t.membershipId, status: 'reserved' },
        data: { status: 'issued', reservedAt: null },
      });
      return mapTxn(updated);
    });
  }

  async get(ctx: TenantContext, txnId: string) {
    return this.tenants.run(ctx, async (tx) => {
      const t = await tx.terminalTransaction.findFirst({ where: { id: txnId, brandId: ctx.brandId! } });
      if (!t) throw new NotFoundException('transaction not found');
      return mapTxn(t);
    });
  }

  /** Offline store-and-forward replay: each op deduped by its idempotency key. */
  async batch(ctx: TenantContext, ops: TxnInput[]) {
    const results: Array<{ idempotencyKey: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const op of ops) {
      try {
        const result = await this.transaction(ctx, op);
        results.push({ idempotencyKey: op.idempotencyKey, ok: true, result });
      } catch (e) {
        results.push({ idempotencyKey: op.idempotencyKey, ok: false, error: e instanceof Error ? e.message : 'error' });
      }
    }
    return { results };
  }

  private scopeData(ctx: TenantContext, membershipId: string, idempotencyKey: string) {
    return {
      brandId: ctx.brandId!,
      groupId: ctx.groupId!,
      platformId: ctx.platformId,
      branchId: ctx.branchId ?? null,
      terminalId: ctx.actor.type === 'terminal' ? ctx.actor.id : null,
      membershipId,
      actorId: ctx.actor.id,
      idempotencyKey,
    } satisfies Partial<Prisma.TerminalTransactionUncheckedCreateInput>;
  }
}
