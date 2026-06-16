# RFM Loyalty Engine — Phase 0 Plan

Multi-tenant, **closed-loop**, B2B2C loyalty platform. Three surfaces (Superadmin, Brand Admin, Customer) + a Terminal/POS integration API, one engine. Tenancy: **Platform → Group → Brand → Branch**, loyalty closed-loop per brand, prepaid wallet per group.

This `docs/` folder is the **Phase 0 deliverable** — research and a written plan, to be reviewed and approved **before any code is scaffolded**.

## Read in this order

| # | Document | What's inside |
|---|----------|---------------|
| 00 | [Research Notes](./00-research-notes.md) | Cited industry research across 8 themes (Talon.One effects model, RLS multi-tenancy, double-entry ledgers, POS integration, modern loyalty/gamification, reporting at scale, security/GDPR, loyalty economics). The evidence base. |
| 01 | [Architecture](./01-architecture.md) | System diagram, tenancy + RLS deep-dive (with policy SQL), double-entry ledger & wallet design (with worked earn/redeem/drawdown entries), terminal integration (HMAC, idempotency, offline replay, state machine, sequence diagram), async/outbox, scaling & multi-region. |
| 02 | [Data Model (ERD)](./02-data-model.md) | Full ERD in 6 themed mermaid diagrams + a table-by-table dictionary (tenant scoping, FKs, constraints, immutable/append-only flags, integer storage). |
| 03 | [API Surface Map](./03-api-surface.md) | Exhaustive endpoint inventory + auth model for all four surfaces, plus cross-cutting conventions (versioning, idempotency, pagination, error envelope, rate limiting, OpenAPI). |
| 04 | [Feature List (v1 vs deferred)](./04-feature-list.md) | Every capability area scoped as v1 / v1.x / deferred, with out-of-scope list and v1 definition-of-done. |
| 05 | [Phased Build Roadmap](./05-roadmap.md) | Phases 1–8 with goals, deliverables, exit criteria, testing strategy per layer, and observability/ops checklist. |
| 06 | [Open Questions & Decisions](./06-open-questions.md) | The decisions I need from you — 4 blocking, plus near-term and commercial items, each with my recommendation and a safe default. |

## Locked baseline (approved 2026-06-13)

NestJS + TypeScript modular monolith · PostgreSQL shared schema + RLS + app-layer scoping · double-entry immutable ledger (points + wallet) · BullMQ/Redis workers + transactional outbox · CQRS rollups + materialized views for reporting · Next.js + Tailwind + shadcn/ui admin frontends (light, airy, gradient/lime-accent design language from the inspirations) · Turborepo + pnpm.

**Decisions locked (2026-06-13):** stack approved · **auth fully in-house** (no third-party IdP) · **default UAE + multi-country** (per-tenant region pinning, multi-currency, EN/AR + RTL, first-class in v1) · wallet drawdown = **hybrid** (issuance fee + redemption cost-per-point + platform margin %) · **POS terminals are first-party** (RFM Loyalty is the payments company; engine serves its own fleet) · **digital rewards only** (no e-commerce/inventory) · breakage = **superadmin-configurable** · customer identity = **global person + per-brand membership** · hosting = **Supabase + DigitalOcean + Vercel** · product name = **RFM Loyalty** (`@rfm-loyalty/*`). Full log in [06-open-questions.md](./06-open-questions.md).

**Status:** plan reviewed; all blocking + near-term decisions locked. **Phase 1 (Foundation) is now in progress.** Remaining non-blocking items (notification providers, compliance confirmation, team/timeline) have safe defaults.
