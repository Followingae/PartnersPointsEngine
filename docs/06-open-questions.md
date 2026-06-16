# Open Questions & Decisions Needed

> Phase 0 — Document 06
> RFM Loyalty Engine — multi-tenant, closed-loop, B2B2C loyalty platform
> Status: Decisions requested before Phase 1 begins.

This is the last Phase 0 deliverable. Everything in docs 00–05 reflects a **recommended baseline** I can build against today. This document lists the decisions that are genuinely yours to make. Each item states **why it matters**, my **recommendation**, and **what I'll assume if you don't override it**, so silence is safe — nothing here blocks me from starting Phase 1 except the four marked 🔴 **BLOCKING**.

Legend: 🔴 blocking (need before Phase 1 scaffolding) · 🟡 near-term (need before the noted phase) · 🟢 product/commercial (refine anytime before it's built).

---

## ✅ Decisions log (2026-06-13)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Stack | **Approved as recommended** — NestJS + TS modular monolith, PostgreSQL + RLS, BullMQ/Redis, Next.js + Tailwind + shadcn/ui admin frontends, Turborepo + pnpm. |
| Q2 | Tenant isolation | **Shared schema + RLS + app-layer guard** (recommended baseline; pre-agreed). |
| Q3 | Market / residency | **Default UAE, but multi-country from the start.** Per-tenant region pinning, multi-currency (default AED, per-brand), bilingual **EN/AR + RTL** in admin UIs, WhatsApp+SMS+email, comply with UAE PDPL (GDPR-aligned). Treated as **first-class v1 concerns**, not deferred. |
| Q4 | Authentication | **Fully in-house — no third-party IdP.** Admin = email/password (argon2id) + **TOTP MFA** → scoped JWT; Customer = phone-OTP → JWT; Terminal = API-key + HMAC. We build the identity module ourselves. |
| Q5 | POS terminals | **First-party** — RFM Loyalty is the payments company; the engine serves **its own POS fleet** (embedded SDK). API stays hardware-agnostic; hardware brand TBD. |
| Q6 | Fulfillment | **Digital rewards only** — points/discounts/vouchers/free-items/tier-perks. No e-commerce/inventory/shipping. Catalog designed to allow physical goods later, but out of scope. |
| Q7 | Hosting | **Supabase** (Postgres + RLS + pooler) · **DigitalOcean** (API + workers + Redis) · **Vercel** (frontends). Residency caveat: no UAE region on either; pin residency-bound tenants to a UAE-region DB if ever required. |
| Q9 | Wallet drawdown | **Hybrid + platform fee** — issuance fee + redemption drawdown at a configurable cost-per-point + platform margin %, configurable per group/contract. |
| Q10 | Breakage | **Superadmin-configurable at any time** (platform default + per-group override, audited, applied going forward). |
| Q11 | Customer identity | **Global person + per-brand membership/wallet** (one login; balances closed-loop; cross-brand platform analytics). |
| Q13 | Product name | **RFM Loyalty** (package scope `@rfm-loyalty/*`; backend = "RFM Loyalty Engine"). |

Still open / to confirm (non-blocking, safe defaults in place): **Q8** (notification providers — Phase 5), **Q12** (customer-app white-label theming — model ready), **Q14** (confirm loyalty engine receives no card/PAN data + target compliance regimes), **Q15** (team & timeline).

---

## 🔴 Blocking — needed before Phase 1

### Q1. Stack approval — ✅ DECIDED: approved as recommended
**Why it matters:** sets the entire repo, hiring, and ops shape.
**Recommendation:** Node.js + TypeScript + **NestJS** modular monolith; **PostgreSQL** (shared schema + RLS); BullMQ/Redis; Prisma; **Next.js** (App Router) + Tailwind + shadcn/ui admin frontends; Turborepo + pnpm. Rationale in `01-architecture.md`.
**Default if unanswered:** proceed with the recommended stack.
**Credible alternatives:** FastAPI (Python) if your team is Python-first; Go if raw throughput dominates over development speed. Either is viable but loses the single-language (TS) benefit shared with the frontends.

### Q2. Tenant isolation model — ✅ DECIDED: shared schema + RLS
**Why it matters:** hard to change later; affects every table, query, and migration.
**Recommendation:** **shared schema + `tenant_id` + Row-Level Security (RLS) + app-layer scoping guard** (defense in depth). Scales to thousands of brands; one migration path; one connection pool. Big tenants can later be promoted to a dedicated shard/DB without a schema change (`02`/`01` §2.6).
**Default if unanswered:** shared schema + RLS as recommended.
**Alternative:** schema-per-tenant — rejected for our scale (per-tenant migrations, catalog bloat, pool exhaustion past a few hundred tenants).

### Q3. Primary market, data residency, currency & language — ✅ DECIDED: default UAE, multi-country
**Why it matters:** drives the primary write region, default currency, **Arabic/English + RTL** in the admin UIs, SMS vs **WhatsApp** for OTP/notifications, and the privacy regime (UAE **PDPL** vs EU **GDPR** vs other).
**Decision (2026-06-13):** **default UAE, but the platform will also run in other countries.** Therefore multi-country is **first-class in v1, not deferred**: per-tenant region pinning (each group's write path pinned to its home region), **multi-currency** (default AED, per-brand overridable), **bilingual EN/AR with full RTL** in both admin frontends, WhatsApp + SMS + email channels, comply with UAE PDPL (GDPR-aligned so EU/other expansion is cheap). New regions are added as countries onboard.

### Q4. Admin authentication: managed vs in-house — ✅ DECIDED: fully in-house
**Why it matters:** shapes the Phase 1 auth skeleton and ongoing security burden.
**Decision (2026-06-13):** **fully in-house — no third-party IdP.** We build our own identity module: admin = email/password (argon2id) + **TOTP MFA** → scoped JWT (access+refresh, rotating); customer = phone-OTP → JWT; terminal = API-key + HMAC. Total control, no per-MAU vendor cost; we own the build and security of credential storage, MFA enrolment, session/refresh-token handling, password reset, and rate-limited login. We apply RFC 9700 hardening in our own first-party auth-code+PKCE flow for SPA token exchange.
**Implication for the roadmap:** Phase 1 includes building the identity module rather than wiring a vendor; Phase 8 security hardening explicitly pen-tests the in-house auth.

---

## 🟡 Near-term — needed before the noted phase

### Q5. POS / terminal hardware & payment-app targets — *before Phase 4*
**Why it matters:** the terminal SDK shape, pairing flow, and "loyalty-as-value-added-service" integration depend on the actual devices. In the GCC this often means **Geidea, Network International (N-Genius), Magnati, PAX, Verifone, or Ingenico** Android smart-POS, or integrating into an existing POS/ECR.
**✅ DECIDED (2026-06-13): first-party terminals.** RFM Loyalty *is* the payments company; the engine integrates with **its own POS terminal fleet**, so the loyalty SDK is embedded in RFM Loyalty's terminal payment app (we control the device software and read payment context natively). The `/v1/terminal/*` contract (HMAC, idempotency, offline replay, authorize→capture/void) stands; the API stays hardware-agnostic and the specific terminal hardware brand can be finalized later.

### Q6. Reward fulfillment scope — ✅ DECIDED: digital only
**Why it matters:** determines whether the catalog needs physical-inventory, stock, and fulfillment, or only digital rewards.
**Decision (2026-06-13): digital rewards only** — points-based and other **digital** reward types (point-burn discounts, vouchers, free-item entitlements, tier perks redeemed at POS/online). **No e-commerce, shipping, inventory, or warehousing** — "we are a loyalty engine." The reward-catalog schema is designed so a physical-goods layer *could* be added later, but it is firmly out of scope.

### Q7. Hosting / cloud — ✅ DECIDED: Supabase + DigitalOcean + Vercel
**Why it matters:** affects managed-service choices (Postgres, Redis, secrets, region).
**Decision (2026-06-13):** **Supabase** (managed Postgres + RLS + Supavisor transaction-mode pooler + read replicas — a natural fit for our tenancy model) · **DigitalOcean** (NestJS API + BullMQ workers on App Platform/Droplets + Managed Redis/Valkey) · **Vercel** (admin frontends).
**⚠️ Residency caveat to track:** neither Supabase nor DigitalOcean currently offers a UAE/GCC region (nearest ≈ Mumbai/Frankfurt). UAE PDPL permits cross-border transfer with appropriate safeguards, so this is acceptable for the default fleet. If a merchant ever has a **strict in-country UAE residency** clause, we pin that tenant to a UAE-region DB (e.g. AWS me-central-1) via the per-tenant region-pinning design — the rest stays on Supabase+DO. Worth confirming no current merchant has that hard requirement.

### Q8. Notification channels & providers — *before Phase 5*
**Why it matters:** WhatsApp is dominant in the GCC; OTP deliverability and cost vary by provider.
**Recommendation:** WhatsApp Business API + SMS (e.g., Twilio/Unifonic/local aggregator) + email (Resend/SES) + mobile push. Pre-expiry reminders, tier changes, and earn/redeem receipts as the v1 templates.
**Default if unanswered:** SMS+email for v1 OTP/receipts; WhatsApp added in v1.x.

---

## 🟢 Product / commercial — refine before the relevant build

### Q9. Merchant wallet drawdown cost model — ✅ DECIDED: hybrid + platform fee
**Why it matters:** this is your **revenue model** and it posts into the wallet ledger; the mechanics are built in Phase 2.
**Decision (2026-06-13): hybrid + platform fee** — a small issuance fee + a redemption drawdown at a configurable cost-per-point + a platform margin %, fully configurable per group/contract. The ledger supports `platform_fee` and reproducible per-journal CPP (`01` §3.7). Still to confirm: the actual numbers, and **Q10 (who bears breakage)**.
**Options considered:**
- **Cost-per-point-issued** — merchant's wallet is drawn down when points are *earned* (predictable liability funding, but pays for breakage).
- **Cost-per-redemption** — drawn down only when points are *redeemed* (aligns cost with realized value; you carry timing risk).
- **Hybrid + platform fee** *(recommended)* — a small issuance fee + a redemption drawdown at a configurable cost-per-point, plus a platform margin %. Fully configurable per group/contract.
**Recommendation:** hybrid + platform fee, configurable per group. The ledger already supports `platform_fee` and reproducible per-journal CPP (`01` §3.7).
**Need from you:** the actual commercial model (or "design a sensible default and we'll tune the numbers").

### Q10. Who bears breakage (unredeemed/expired points)? — ✅ DECIDED: superadmin-configurable
**Why it matters:** accounting + economics; affects which ledger accounts breakage posts into.
**Decision (2026-06-13):** breakage handling is a **superadmin-configurable policy, editable at any time** (a platform default with per-group override), audited, and applied **going forward** (changing it never rewrites historical entries). The ledger supports `breakage_income:<brand>` and a platform breakage account; the policy decides where breakage value posts. We build the config surface in the superadmin API + the Phase 2 ledger/economics work.

### Q11. Customer identity across brands
**Why it matters:** privacy and UX. Can one phone number be a single "person" the platform recognizes across many brands (closed-loop balances, but shared profile/auth), or must each brand's customers be fully siloed?
**✅ DECIDED (2026-06-13): global person identity** (deduped by phone/email) + **per-brand membership & per-brand point wallet**. Balances stay strictly closed-loop; the person gets one login and the platform gets cross-brand insight. A brand admin only ever sees its own membership rows. Matches `02-data-model.md` as built.

### Q12. White-label / branding scope for the customer app (built later)
**Why it matters:** affects theming architecture even though the mobile app is out of scope now.
**Recommendation:** assume **per-brand white-label theming** (logo, palette, name) so the future customer app can be brand-skinned from config. The engine already stores `brand.branding` (jsonb).
**Default if unanswered:** per-brand theming supported in the data model now; UI deferred.

### Q13. Product/brand name — ✅ DECIDED: RFM Loyalty
**Why it matters:** used in repo names, OpenAPI titles, package scopes, and the admin UI.
**Decision (2026-06-13):** the product/company is **RFM Loyalty** (a payments company). I'll use **"RFM Loyalty"** as the product brand and `@rfm-loyalty/*` as the package scope; the backend service is the "RFM Loyalty Engine."

### Q14. Compliance & PCI posture — ⚠️ confirm
**Why it matters:** scope and audit burden — and RFM Loyalty *is* a payments company, so its **payment** stack is in PCI scope.
**Recommendation / nuance:** the **loyalty engine** never touches card/PAN data — the embedded loyalty SDK receives only non-card context (amount, terminal/txn id, member token) from RFM Loyalty's payment app, keeping **the loyalty engine out of PCI-DSS cardholder-data scope** even though the terminal device's *payment* function is handled by RFM Loyalty's (separate) PCI-scoped payment stack. We implement PII encryption-at-rest + crypto-shredding for GDPR/PDPL erasure while preserving the immutable ledger (`01` §2, `02`).
**Need from you:** confirm the loyalty engine will **not** receive card/PAN data from the terminal, and your target compliance regimes (PDPL, GDPR, SOC 2?).

### Q15. Team, timeline & sequencing pressure
**Why it matters:** lets me right-size each phase's exit bar and parallelism.
**Need from you:** solo vs team, any hard deadline or launch event, and whether any phase (e.g., a specific merchant pilot) must be pulled forward.

---

## What I'll do next

All blocking and near-term questions are resolved. I'm beginning **Phase 1 — Foundation** (`05-roadmap.md`): scaffold the Turborepo monorepo (`@rfm-loyalty/*`), Prisma schema with RLS, transaction-scoped tenant-context middleware, the **in-house** auth skeletons (admin email/password + TOTP MFA, customer phone-OTP, terminal API-key + HMAC), CI (incl. the cross-tenant RLS test suite), and auto-generated OpenAPI — a deployable, observable walking skeleton with no business logic yet — then stop for review at the end of the phase.

Still-open (non-blocking, safe defaults in place): Q8 notification providers (Phase 5), Q12 customer-app white-label theming (data model ready), Q14 compliance confirmation, Q15 team/timeline.
