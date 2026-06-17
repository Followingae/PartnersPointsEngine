import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ledger, type Prisma } from '@rfm-loyalty/db';
import { EarnRule, evaluateEarn, type CustomerIdentifierType, type TenantContext } from '@rfm-loyalty/shared';
import { TokenService, type MemberTokenClaims } from '../../auth/tokens/token.service';
import { TenantService } from '../../platform-core/tenancy/tenant.service';
import { LoyaltyService, scheduleContext } from '../loyalty-rules/loyalty.service';

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
  ) {}

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

      let redeem: { points: number; affordable: boolean } | undefined;
      if (dto.redeemPoints && dto.redeemPoints > 0) {
        const bal = await this.loyalty.balance(ctx, claims.membershipId);
        redeem = { points: dto.redeemPoints, affordable: BigInt(bal.available) >= BigInt(dto.redeemPoints) };
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
        return mapTxn(created);
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
