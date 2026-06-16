# Phase 4 — Terminal/POS Gateway: Status

> Built and verified locally (embedded Postgres) on 2026-06-13. Continuous "PROCEED ALL" build.

## What was built
- **Terminal transaction state machine** (`terminal_transaction`, 30 tables total): `pending → authorized → captured/voided`, intent earn|redeem, idempotency per `(actor, key)`, journal links.
- **Production HMAC auth** (`TerminalHmacGuard`): parses `Loyalty-HMAC` auth, enforces timestamp-skew + nonce, **decrypts the per-terminal secret (envelope AES-256-GCM) and verifies the signature over the raw body**. `rawBody` capture enabled in bootstrap. (Nonce replay-cache → Phase 8.)
- **Member tokens**: `resolve` an identifier (phone/qr/nfc/loyalty_id) → short-lived signed `member_token`; consumed by subsequent calls (no PII echoed).
- **`TerminalService`**: `resolve`, `quote` (preview earn/redeem, no mutation), `transaction` (earn single-step / redeem authorize), `capture`, `void`, `get` (poll), and **offline `batch` replay** (deduped by idempotency key). Earn composes `LoyaltyService.earnWithTx` in the same transaction.
- **Endpoints** `/v1/terminal/*` (8 routes) + **`@rfm-loyalty/sdk-terminal`**: a typed Node client that HMAC-signs every request.

## Verified ✅ — 30 tests across the workspace
- **api: 5 terminal integration tests** (resolve → member token; POS earn + balance; idempotent replay; redeem authorize→capture; offline batch dedup) against embedded Postgres.
- db: 18 (RLS + ledger + loyalty) · shared: 7 (rules) — all still green.
- Build, typecheck, lint clean; DI smoke test boots the full app; **OpenAPI now 29 routes**.

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Narrow versioned `/v1/terminal/*` + webhooks | ✅ endpoints (webhook delivery → Phase 5/6 outbox worker) |
| API key + HMAC + short-lived (member) tokens | ✅ |
| Mandatory idempotency | ✅ per (actor, key) |
| authorize → capture/void state machine | ✅ |
| Offline store-and-forward + replay | ✅ batch endpoint, idempotent |
| Typed SDK | ✅ sdk-terminal |

## Deferred
- **Group-wallet drawdown settlement** on redeem capture → Phase 5 (group-scoped settlement worker; terminal context is brand-scoped, so the wallet draw is async). Wallet engine already tested in Phase 2.
- **Nonce replay cache** (Redis) + connection-token exchange → Phase 8.
- **Webhook emission** of terminal events → Phase 5/6 (outbox relay).

Next: **Phase 5 — Campaigns, gamification, referrals, vouchers + wallet settlement worker.**
