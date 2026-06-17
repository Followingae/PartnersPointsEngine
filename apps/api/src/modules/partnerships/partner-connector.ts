import { Injectable, Logger } from '@nestjs/common';

/**
 * Abstraction over a loyalty partner's engine (e.g. Lulu Happiness Loyalty Engine).
 * Built so the whole partnership ships now against a stub; when the real API is
 * available we add an HTTP implementation and flip `Partner.connectorMode` — no
 * change to the conversion flow, schema, or UI.
 */
export interface PartnerConnector {
  /** Validate / resolve a partner member by their reference (card / phone). */
  lookupMember(ref: string): Promise<{ valid: boolean; memberRef: string }>;
  /** Credit partner points to a member's account (idempotent on `idempotencyKey`). */
  creditPoints(args: { memberRef: string; points: number; idempotencyKey: string; ref: string }): Promise<{ partnerTxnRef: string }>;
  health(): Promise<{ healthy: boolean; detail: string }>;
}

/**
 * Stand-in connector used while we await the live Lulu API. No external calls:
 * lookups succeed for any plausible ref, credits return a synthetic txn ref.
 * Phase 2 adds `LuluHttpConnector implements PartnerConnector` and selects it by
 * `connectorMode`.
 */
@Injectable()
export class StubLuluConnector implements PartnerConnector {
  private readonly logger = new Logger('StubLuluConnector');

  async lookupMember(ref: string): Promise<{ valid: boolean; memberRef: string }> {
    const memberRef = (ref ?? '').trim();
    return { valid: memberRef.length >= 4, memberRef };
  }

  async creditPoints(args: { memberRef: string; points: number; idempotencyKey: string; ref: string }): Promise<{ partnerTxnRef: string }> {
    this.logger.log(`[STUB] credit ${args.points} partner pts to ${args.memberRef} (ref ${args.ref})`);
    return { partnerTxnRef: `stub_${args.ref}` };
  }

  async health(): Promise<{ healthy: boolean; detail: string }> {
    return { healthy: true, detail: 'stub connector — no external API yet' };
  }
}
