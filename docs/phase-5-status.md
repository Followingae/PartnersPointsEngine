# Phase 5 — Campaigns, Gamification, Referrals & Workers: Status

> Built and verified locally (embedded Postgres) on 2026-06-14. Continuous "PROCEED ALL" build.

## What was built
- **Campaigns** — time-boxed earn rules (bonus/multiplier/conditions) evaluated by the same rules engine, merged into the earn flow when active (`campaign` table, `CampaignService`).
- **Gamification** — lifetime-points **challenges** that award a **badge + bonus points** when crossed (one-time, idempotent, same-tx as the earn), brand **leaderboard**, badge listing (`badge`, `badge_award`, `challenge`, `challenge_progress`, `GamificationService`). Bonus earns are tagged so they don't recursively re-trigger.
- **Referrals** — per-member referral codes; redeeming rewards both parties via the ledger (`referral`, `ReferralService`).
- **Vouchers lifecycle** — issue on redemption (Phase 3) + **redeem/expire** (`LoyaltyService.redeemVoucher`).
- **Workers**:
  - **Group-wallet settlement** — captured POS redemptions are drawn down against the group's prepaid wallet asynchronously (group-scoped, idempotent per terminal txn, applies the configurable cost-per-point + platform margin). Completes Phase 4's deferred drawdown.
  - **Transactional outbox** (`OutboxService.emit`, same-tx) + **webhook delivery** (`WebhookService`): relay outbox → per-endpoint deliveries → **HMAC-signed POST** with retries/backoff and dead-lettering (`webhook_endpoint`, `webhook_delivery`).
  - **BullMQ scheduler** (`WorkerScheduler`) — registers repeatable jobs (settlement / webhooks / nightly point-expiry) when `REDIS_URL` is set; **lazily loaded and guarded** so the app/tests/OpenAPI boot cleanly without Redis.
- New endpoints: manage (`campaigns`, `badges`, `challenges`), customer (`badges`, `leaderboard`, `referral-code`, `referral/redeem`, `vouchers/:code/redeem`). **38 tables, 37 OpenAPI routes.**

## Verified ✅ — 36 tests
- **api: 11** (5 terminal + **6 engagement**: campaign bonus stacks on base earn; challenge→badge+bonus; referral rewards both; voucher redeem; **wallet settlement** draws 22,000 of 1,000,000 for a 200-pt redeem @ 100 fils +10%; **outbox→signed webhook** delivered with `X-Loyalty-Signature`).
- db: 18 · shared: 7 — all green. Build/typecheck/lint 0 errors; DI smoke boots the full app (incl. WorkersModule).

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Campaigns/promotions (time-boxed, segments) | ✅ time-boxed + conditions (audience segments → Phase 6) |
| Gamification (challenges, badges, leaderboards) | ✅ (streaks/missions/quests → fast-follow) |
| Referrals | ✅ |
| Coupons/vouchers lifecycle | ✅ |
| Async workers (settlement, expiry, webhooks) via queue | ✅ services + BullMQ wiring (expiry sweep logic → Phase 6 with point lots) |

## Deferred
- **Point-lot tracking → FIFO expiry/breakage sweep** → Phase 6 (needs per-lot remaining; earn currently posts `active`).
- **Segment/audience targeting**, streaks/missions/quests → fast-follow.
- **Webhook worker process** (BullMQ Worker that iterates tenants and calls the services) → deployment/Phase 8; the services + scheduler are in place.

Next: **Phase 6 — Reporting & analytics** (CQRS rollups, RFM, cohort/churn, exports) for brand + superadmin.
