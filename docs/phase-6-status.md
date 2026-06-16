# Phase 6 — Reporting & Analytics: Status

> Built and verified locally (embedded Postgres) on 2026-06-14. Continuous "PROCEED ALL" build.

## What was built
- **`ReportingService`** (CQRS reads, rebuildable from the ledger; replica-safe SQL):
  - **Brand summary** — points earned/redeemed, **outstanding liability**, member count.
  - **RFM segmentation** (the platform's namesake): per-member Recency/Frequency/Monetary via SQL `ntile(5)` quintile scoring → segment (champions, loyal, at_risk, hibernating, …).
  - **Daily rollup** into `brand_daily_metric` (earned/redeemed/expired/txns/active) — idempotent upsert.
  - **RFM snapshot** persistence (`rfm_snapshot`) for point-in-time reporting.
  - **Superadmin overview** — platform-wide points liability, wallet balances, group/brand/journal counts.
  - **CSV export** for RFM.
- **`ExpirySweepService`** — **FIFO point expiry / breakage** without a lot table: expiring = (earned in expired buckets) − (already debited), capped at available; posts a breakage journal (`DEBIT liability / CREDIT breakage_income`), which is idempotent on re-run. Earns now carry a 12-month rolling expiry bucket.
- New endpoints: `/v1/manage/reports/{summary,rfm,rfm.csv,rollup,rfm-snapshot}` (brand, `brand.report.read`) and `/v1/admin/reports/overview` (superadmin, `platform.report.read`). **40 tables, 43 OpenAPI routes.**

## Verified ✅ — 41 tests
- **api: 16** (+5 reporting: brand KPIs `earned=1600 / liability=1600 / members=3`; RFM scores+segments with top monetary; daily rollup + RFM snapshot; **FIFO expiry** burns 400 pts to breakage and is idempotent; superadmin overview).
- db: 18 · shared: 7 — green. Build/typecheck/lint 0 errors; DI smoke boots the full app.

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Pre-aggregated rollups (rebuildable) | ✅ brand_daily_metric |
| RFM segmentation | ✅ quintile scoring + segments + snapshot |
| Points-liability + wallet reporting | ✅ brand + superadmin |
| Exports (CSV) | ✅ RFM CSV (Excel/PDF later) |
| Point expiry / breakage | ✅ FIFO sweep |
| Cohort retention / churn | ⏳ basis in place (snapshots + recency); dedicated cohort/churn queries are a fast-follow |

## Deferred
- **Cohort retention & churn dashboards**, channel breakdown (needs channel on journals), per-branch/campaign ROI deep-dives → fast-follow (the data + rollup pattern are in place).
- **OLAP store (ClickHouse/DuckDB)** → only if the documented "Postgres wall" is hit (per `00-research-notes`); Postgres-first holds for now.
- Excel/PDF exports → Phase 8.

Next: **Phase 7 — Admin frontends** (superadmin + brand) in the inspo design language, consuming the generated OpenAPI.
