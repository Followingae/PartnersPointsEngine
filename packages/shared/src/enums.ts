import { z } from 'zod';

/** Tenant hierarchy levels: platform → group → brand → branch. */
export const ScopeLevel = z.enum(['platform', 'group', 'brand', 'branch']);
export type ScopeLevel = z.infer<typeof ScopeLevel>;

/** Which API audience a request belongs to. */
export const ApiSurface = z.enum(['superadmin', 'brand_admin', 'customer', 'terminal']);
export type ApiSurface = z.infer<typeof ApiSurface>;

/** Lifecycle status for configuration/entity rows (we soft-status, never hard-delete config). */
export const EntityStatus = z.enum(['active', 'inactive', 'suspended', 'archived']);
export type EntityStatus = z.infer<typeof EntityStatus>;

/** The two ledgers that ride on one double-entry engine. */
export const LedgerName = z.enum(['points', 'wallet']);
export type LedgerName = z.infer<typeof LedgerName>;

/** Lifecycle states a points entry moves through (earned ≠ spendable). */
export const PointState = z.enum([
  'pending', // earned but within activation/return window
  'active', // available to redeem
  'redeemed', // consumed by a redemption
  'expired', // breakage
  'reversed', // clawed back (return/fraud)
  'adjusted', // manual correction
]);
export type PointState = z.infer<typeof PointState>;

/** Business event kinds posted to the ledger (a journal's `kind`). */
export const JournalKind = z.enum([
  'earn',
  'redeem_auth',
  'redeem_capture',
  'void',
  'reverse',
  'topup',
  'drawdown',
  'expiry',
  'adjust',
  'fee',
]);
export type JournalKind = z.infer<typeof JournalKind>;

/** Double-entry direction. */
export const EntryDirection = z.enum(['debit', 'credit']);
export type EntryDirection = z.infer<typeof EntryDirection>;

/** Ways a customer can be identified at the point of sale / in the app. */
export const CustomerIdentifierType = z.enum([
  'phone',
  'email',
  'qr',
  'nfc',
  'loyalty_id',
  'card_token',
]);
export type CustomerIdentifierType = z.infer<typeof CustomerIdentifierType>;

/** Built-in role keys (RBAC). Custom roles may be added per platform later. */
export const RoleKey = z.enum([
  'platform_superadmin',
  'platform_support',
  'group_admin',
  'brand_admin',
  'brand_manager',
  'branch_manager',
  'analyst_readonly',
]);
export type RoleKey = z.infer<typeof RoleKey>;

/** Terminal transaction state machine. */
export const TerminalTxnState = z.enum([
  'pending',
  'authorized',
  'captured',
  'voided',
  'expired',
  'reversed',
  'failed',
]);
export type TerminalTxnState = z.infer<typeof TerminalTxnState>;
