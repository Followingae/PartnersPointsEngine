# Phase 2 — Ledger & Wallet Core: Status

> Built and verified locally (embedded Postgres, no Docker/Supabase) on 2026-06-13. Stop point for review before Phase 3 (Loyalty engine + Customer API).

## What was built

The **double-entry, append-only, integer-amount** ledger that is the monetary foundation of the platform — one engine, two ledgers (points per customer-per-brand, wallet per group) — plus the **hybrid wallet drawdown**.

### Schema (now 25 tables, 11 enums)
New in `packages/db/prisma/schema.prisma`: `ledger_account`, `journal`, `entry`, `account_balance`, `group_wallet`, `cost_rule`, and 6 ledger enums. Amounts are `BigInt` (integer minor units / whole points). Keys are uuid-v7 (time-ordered).

### Integrity SQL (`packages/db/prisma/sql/ledger.sql`)
What Prisma can't express, enforced in Postgres:
- **append-only** triggers on `journal` + `entry` (no UPDATE/DELETE);
- **balanced-journal** constraint trigger (Σ debits = Σ credits, single asset) — *deferred, checked at commit*;
- **positive amounts** CHECK on `entry`;
- **no-negative** CHECK on `account_balance` for credit-normal accounts;
- **account-identity** unique index (one account per ledger/type/asset/group/brand/customer).
RLS extended to all ledger tables (brand-hier) and wallet config (group-hier) in `rls.sql`.

### Engine (`packages/db/src/ledger/`, framework-agnostic)
- `engine.ts` — `getOrCreateAccount`, `postJournal` (+ `applyBalances` flag), guarded `holdPending` / `captureHold` / `releasePending` / `creditAccount`, `getBalance`, and idempotency (`reserveIdempotency` / `completeIdempotency`).
- `operations.ts` — `earnPoints`, `authorizeRedeem` → `captureRedeem` / `voidRedeem`, `topUpWallet`, `drawdownWallet` (hybrid cost model). Every op is idempotent on `(actorId, key)` and runs inside the caller's transaction.
- Correctness is layered: **idempotency keys → guarded conditional balance updates (race-safe) → DB constraints (balanced trigger + non-negative CHECK)** as backstops.

### API integration
Thin NestJS wrappers (`LedgerService`, `WalletService`) run each op inside `TenantService.run` (RLS tenant context applied), so the engine is reachable from the app and stays closed-loop per brand. HTTP endpoints that call these arrive in Phase 3.

## Worked examples (as tested)
- **Earn:** `DEBIT points_expense / CREDIT points_liability` → available rises by the points.
- **Redeem:** authorize places a *hold* (`pending_debits`, reduces available, can't be double-spent) → capture converts the hold to a posted spend `DEBIT liability / CREDIT revenue` → void releases the hold.
- **Top-up:** `DEBIT cash_clearing / CREDIT wallet_liability`.
- **Hybrid drawdown (300 pts @ 100 fils + 10% margin):** `DEBIT wallet_liability 33000 / CREDIT redemption_cost 30000 / CREDIT platform_fee 3000`; wallet guarded against overdraw.

## Verified ✅ — 16 tests passing against real Postgres
`pnpm --filter @rfm-loyalty/db test` (boots embedded Postgres 17, applies baseline + RLS + ledger SQL):
- **10 ledger tests:** earn; idempotent replay (no double-credit); authorize reduces available + over-authorize rejected; capture; void; **unbalanced journal rejected by the DB trigger**; **concurrent double-spend prevention** (10 parallel redeems of 200 vs 1000 → exactly 5 succeed, balance 0, never negative); wallet top-up + hybrid drawdown math; drawdown overdraw blocked; **global Σ-entries = 0 invariant**.
- **6 RLS tests** (from Phase 1) still green.
- `pnpm build`, `pnpm typecheck`, `pnpm lint` clean; DI smoke test boots the full app including the ledger/wallet services.

## Phase 2 exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Double-entry posting engine (balanced, append-only) | ✅ |
| Idempotency on every mutating op | ✅ |
| Materialized balances updated in-transaction | ✅ |
| No-negative balance + concurrency safety (no double-spend) | ✅ (tested under parallelism) |
| Wallet top-up + hybrid drawdown (cost-per-point + margin) | ✅ |
| Property / concurrency tests | ✅ 16 passing on real Postgres |
| Reversing entries for corrections | ⏳ partial (void implemented; full `reverse` linkage Phase 3) |

## Deferred (by design)
- **HTTP endpoints** for ledger/wallet → Phase 3/Superadmin (services are ready).
- **Pending→active activation, FIFO expiry/breakage sweep, tier recompute** → Phase 3 (scheduled workers).
- **Breakage policy config surface** (superadmin-editable owner: merchant/platform/split) → Phase 3 (the `cost_rule.breakage_owner` field + accounts exist).
- **Reconciliation worker** (re-derive balances, clearing tie-outs) → Phase 6.
- **Issuance-fee drawdown at earn time** → wired when earn endpoints land (Phase 3); drawdown-at-redeem is implemented.

## Local test note
No Docker/Supabase needed: tests boot a real **embedded Postgres 17** locally (forced to UTF-8). CI uses its Postgres service via `DATABASE_URL`. The schema/RLS/ledger SQL have now been **executed against a real Postgres** (16 green tests) — the first live validation of the migrations.

## Suggested next step
**Phase 3 — Loyalty engine + Customer API:** the rules engine (pure decision → effects), earn/redeem rule config, tiers, pending→active + expiry workers, and the customer-facing endpoints that drive the ledger you just built.
