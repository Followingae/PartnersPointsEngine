# Phase 7 — Admin Frontends: Status

> Built and verified locally on 2026-06-14. Both apps run against the local stack (no Docker/Supabase).

## What was built
- **Design system** (in the brand app, shared with superadmin): the `@rfm-loyalty/config` Tailwind preset + a light, airy theme with **lime/chartreuse + near-black ink**, **coral→pink / teal→blue gradient stat-hero cards**, soft large-radius cards, and distinctive type — **Bricolage Grotesque** (display) + **Hanken Grotesk** (body). UI primitives: `Card`, `StatHero`, `Badge`, `SectionTitle`; an icon-rail `Sidebar`; Recharts `TrendChart` (area) + `SegmentBars`.
- **`web-brand`** (Next.js App Router, :3000): in-house **login** (email/password → JWT in localStorage) → auth-gated shell → **Dashboard** (gradient stat heroes for liability/earned/redeemed/members, points-activity area chart, **RFM segment bars**, top-members list) + **Customers** page (full RFM table with segments). Consumes `/v1/auth` + `/v1/manage/reports/*`.
- **`web-superadmin`** (:3002): superadmin login → **Platform overview** (points liability across the platform, wallet balances, brands/groups counts, ledger-journal volume, liability-health panel). Consumes `/v1/admin/reports/overview`.
- **Local run stack**: persistent embedded Postgres (`pnpm db:dev`) with a demo-activity seed, root `.env`, and `pnpm dev` to bring up API + apps.

## Verified ✅ (end-to-end, live)
Brought the whole stack up locally and confirmed:
- **DB** (5432) seeded · **API** (3001) healthy · **web-brand** (3000) and **web-superadmin** (3002) both serve `200`.
- Brand login → `/manage/reports/summary` = `earned 1650 · redeemed 50 · liability 1600 · members 2`, plus trend + RFM rows.
- Superadmin login → `/admin/reports/overview` = `liability 4800 · brands 3 · groups 2 · journals 24`.
- Both apps `next build` cleanly (types valid).

> **Real bug caught by running it:** a prior lint-autofix had turned the auth controllers' **DTO imports into `import type`**, erasing request-body type metadata so `ValidationPipe` rejected every field. Unit/integration tests call services directly and never hit the HTTP validation layer, so only a live request exposed it. Fixed (value imports) and re-verified. Lesson reinforced: actually run the thing.

## Run it
```
pnpm db:dev      # terminal 1 — persistent local Postgres (+ seed on first run)
pnpm dev         # terminal 2 — API :3001, brand :3000, superadmin :3002
```
- Brand: http://localhost:3000 — `admin@camel-bean.dev` / `ChangeMe123!`
- Superadmin: http://localhost:3002 — `superadmin@rfm-loyalty.dev` / `ChangeMe123!`

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Superadmin + Brand admin apps | ✅ both |
| Inspo design language (light, gradients, lime+ink, stat heroes, charts, icon rail) | ✅ |
| Consume the engine APIs (auth + reporting) | ✅ live |
| Runnable locally | ✅ verified end-to-end |

## Deferred / fast-follow
- Generated typed SDK from OpenAPI (currently hand-written typed clients), more pages (campaigns/rewards CRUD UIs, wallet top-up UI for superadmin), i18n/RTL (EN/AR), auth refresh-token rotation in the UI, and a screenshot/visual-regression pass (the Claude Chrome extension wasn't connected in this environment to auto-capture).

Next: **Phase 8 — Hardening** (security review, load test, observability, nonce replay cache, e2e/supertest, Excel/PDF exports, webhooks GA, deploy configs for Supabase + DigitalOcean + Vercel).
