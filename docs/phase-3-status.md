# Phase 3 — Loyalty Engine + Customer API: Status

> Built and verified locally (embedded Postgres) on 2026-06-13. Part of the continuous "PROCEED ALL" build.

## What was built
- **Rules engine** (`packages/shared/src/rules.ts`, pure, Talon.One-style): serializable condition tree (AND/OR/NOT over typed namespaced attributes, bounded operators incl. regex with length cap), earn actions (perAmount/perVisit/perSku/bonus/multiplier/cap), `evaluateEarn(rules, ctx) → decision + ordered-independent effects`. **7 unit tests.**
- **Loyalty config schema** (29 tables total): `earn_rule` (stores the engine JSON), `tier`, `reward_catalog_item`, `voucher` (+ `voucher_status`). Brand-scoped, under RLS.
- **`LoyaltyService`** (apps/api): load brand earn rules → evaluate → award via the ledger (`earn`); redeem a catalog item → ledger authorize→capture + issue voucher; balance/lifetime/tier resolution; transaction history; catalog; brand-admin config (create earn-rule [validated against the engine], catalog item, tier). Everything runs inside the RLS tenant transaction.
- **Customer API** (`/v1/customer/*`, CustomerJwtGuard): `GET balance`, `GET transactions`, `GET rewards`, `POST rewards/:id/redeem`.
- **Brand-admin API** (`/v1/manage/*`, AdminJwtGuard + PermissionsGuard): `POST/GET earn-rules`, `POST rewards`, `POST tiers`, `POST customers/earn`.

## Verified ✅
- `pnpm build`, `pnpm typecheck`, `pnpm lint` clean.
- **18 db tests** (6 RLS + 10 ledger + **2 loyalty integration**: rules→effects→ledger earn, and redeem-to-balance) + **7 rules-engine tests** = 25 green.
- DI smoke test boots the full app; **OpenAPI now exposes 22 routes** across all surfaces.

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Rules engine (decision → effects) | ✅ |
| Earn/redeem rule config (brand-scoped) | ✅ (earn rules + catalog) |
| Tiers (thresholds, multiplier, resolution) | ✅ (read/resolve; downgrade/anniversary later) |
| Customer API (balances, history, catalog, redeem) | ✅ |
| Apply effects → ledger | ✅ (earn + redeem→voucher) |

## Deferred to later phases
- **Pending→active activation + FIFO expiry/breakage workers** → Phase 5/6 (BullMQ). Earn currently posts `active`.
- **Redemption draws down the group wallet** (cost_rule) → wired in Phase 4/5 alongside terminal capture.
- **Effects beyond addPoints** (discount/free-item at POS) → Phase 4; **segments/targeting** → Phase 5.
- Full **e2e HTTP tests** (supertest against the running API) → Phase 8; currently the HTTP layer is validated by the DI smoke test and the engine/integration tests.

Next: **Phase 4 — Terminal/POS gateway** (HMAC, idempotency, offline replay, transaction state machine) driving earn/redeem + wallet drawdown.
