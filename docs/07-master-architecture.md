# RFM Loyalty Engine — Master Product Architecture & Build Roadmap

**Status:** Plan of Record · **Supersedes:** all six domain designs (consolidated here) · **Wave 1 = DONE** (core engine, ledger, terminal API, RLS, auth, brand CRUD + Customer 360 drawer, superadmin merchants list + 360 drawer, RFM/breakage/cohort reporting backends). This document is the navigation, governance, analytics, and sequencing contract. Conventions inherited and non-negotiable: UUID v7 PKs, integer minor-units / whole-integer points, `brand_id` (loyalty) + `group_id` (wallet) denormalized for flat RLS, append-only ledgers, transactional outbox + BullMQ, hash-chained `audit_log`, envelope-encrypted secrets/PII, idempotency on every mutation, pages-not-drawers for all detail surfaces.

---

## 1. North Star

We are building the **system-of-record loyalty control plane for multi-brand merchants** — a closed-loop engine with a money-grade double-entry ledger underneath and two industry-leading consoles on top: a **deep superadmin platform** that runs the tenant hierarchy, prepaid economics, governance, and cross-tenant intelligence; and a **brand console** that lets marketers operate a program end-to-end with real analytics (CLV, visit frequency, cohort/retention, ROI, points liability) and full-page detail surfaces, never popups. The differentiator versus Talon.One / Antavo / Capillary / Voucherify / Smile.io / Marigold is the fusion of **a reconcilable accounting ledger + ASC 606 liability**, **a maker-checker governance model the platform owner controls per brand and per capability**, and **analytics that are exportable, scheduled, and reproducible from immutable data**. Everything is a bookmarkable URL with sub-pages, everything is audited and tamper-evident, and every metric is derivable from the ledger — so the product is trustworthy enough to be the merchant's loyalty general ledger, not just a campaign tool.

---

## 2. Full Sitemap (navigation contract)

Route prefixes: superadmin console `/admin/*` (API `/v1/admin/*`); brand console root pages `/*` (API `/v1/manage/*`). Every `:id` detail is a **full page with sub-routes (tabs)**, not a drawer. Standard sub-route grammar: `…/:id/detail`, `…/:id/builder`, `…/:id/performance`, `…/:id/members`.

### 2.1 Superadmin Console (`/admin`)

- **/admin** — Platform Dashboard (KPIs, health checks, alerts, governance/approvals widget, low-balance + DLQ + reconciliation-drift surfacing)
- **/admin/merchants** — Merchants Directory (search, KPIs, inline actions)
  - **/admin/merchants/onboarding** — Onboarding wizard (create group → currency/region → auto-provision wallet → invite brand-admin)
  - **/admin/merchants/:groupId** — Merchant Detail (hub) → tabs:
    - `/overview` — profile, KPIs, financial snapshot, recent activity
    - `/wallet` — prepaid ledger, posted/pending/available, top-up, statement generation
    - `/billing` — top-ups, invoices, auto-top-up, billing contact/address
    - `/brands` — brands (programs) under merchant, create/edit
    - `/branches` — branches + terminals, POS pairing status
    - `/team` — users in group scope, RBAC, invite/deactivate
    - `/cost-rules` — version history, CPP mode (fixed/tiered/weighted_avg), markup %, breakage owner, effective dating
    - `/governance` — **per-brand + per-capability governance mode editor** (lives under merchant for context; see §4)
    - `/audit` — hash-chained log filtered to group, export
    - `/settings` — name, currency, region, plan/tier, webhooks, contacts
- **/admin/brands** — Brands Directory (cross-merchant, KPIs, analytics shortcuts)
  - **/admin/brands/:brandId** — Brand Analytics & Management → tabs:
    - `/overview` — KPIs, 30-day trends, cohorts
    - `/members` — list with RFM segment, CLV, tier, last purchase, balance
    - `/rfm` — segment distribution + per-segment metrics
    - `/campaigns` — list + performance (reach, conversion, ROI)
    - `/rewards` — catalog, inventory, redemption stats
    - `/tiers` — definitions, distribution, benefits
    - `/rules` — earn-rule library, status, performance impact
    - `/governance` — read-through to this brand's effective governance config (link to merchant editor)
    - `/activity` — audit filtered to brand
- **/admin/wallet-billing** — Wallet & Billing (platform-wide)
  - `/statements` — monthly statements by group, downloadable
  - `/auto-topup` — auto-top-up rules per merchant, thresholds, audit trail
  - `/low-balance-alerts` — alert config, history, test send
  - `/revenue` — MRR, fees collected, points issued-vs-redeemed cost trend, per-merchant contribution
- **/admin/plans-pricing** — Plans & Pricing (entitlements)
  - `/plans` — plan definitions + feature-limits matrix
  - `/assignments` — merchant plan assignments + overage checks
- **/admin/approvals** — **Approvals Queue (governance)** — pending change-requests across all brands; multi-select bulk approve/reject; SLA aging color-coding
  - **/admin/approvals/:requestId** — Change-Request Detail (side-by-side before/after diff, requester, decision controls, audit timeline)
  - `/admin/approvals/history` — approved/rejected/withdrawn archive
- **/admin/governance-dashboard** — Governance Metrics (pending count, approval rate, avg decision time/SLA, per-brand mode distribution, decision audit)
- **/admin/analytics** — Platform Analytics (cross-merchant)
  - `/overview` — platform KPIs + trends
  - `/cohorts` — cohort retention table, brand/merchant/date filters, CSV export
  - `/segments` — RFM deep-dive per brand, member-list-per-segment
  - `/clv` — CLV histogram + percentiles (cross-brand)
  - `/benchmarking` — brand-vs-platform-avg (retention, churn, CLV quartiles) **[beyond]**
  - `/exports` — data export center: scheduled exports, ad-hoc query builder (members/transactions/ledger), export history
- **/admin/platform-services** — Platform Services hub
  - `/notifications/providers` · `/notifications/providers/:id` · `/notifications/templates` · `/notifications/templates/:id` · `/notifications/triggers` · `/notifications/delivery-log`
  - `/webhooks/endpoints` · `/webhooks/endpoints/:id` · `/webhooks/deliveries` · `/webhooks/deliveries/:id` · `/webhooks/dlq` · `/webhooks/events`
  - `/api-keys/keys` · `/api-keys/keys/new` · `/api-keys/keys/:id` · `/api-keys/audit`
  - `/integrations/marketplace` · `/integrations/marketplace/:id` · `/integrations/installed` · `/integrations/installed/:id`
- **/admin/team** — Platform Team & RBAC
  - `/users` · `/users/:userId` (roles, 2FA, login history, revoke sessions) · `/users/invite`
  - `/roles` · `/roles/:roleId` (permission matrix, clone) · `/permissions` (catalog)
  - `/audit` — superadmin actions + impersonations
- **/admin/auth** — Authentication & SSO
  - `/sso` · `/sso/metadata` · `/mfa` · `/password-policy` · `/sessions`
- **/admin/compliance** — GDPR & Data Privacy
  - `/dsr` · `/dsr/:id` · `/erasure` · `/erasure/:id` · `/consent` · `/data-lineage`
- **/admin/localization** — Multi-language & Regional
  - `/languages` · `/translations` · `/translations/:key` · `/regional-settings`
- **/admin/audit-log** — Platform-wide audit viewer (`/admin/audit-log/:logId`, chain verify, export)
- **/admin/support** — Support Console & Impersonation
  - `/search` · `/impersonate/:targetType/:targetId` · `/impersonate/:targetType/:targetId/session` · `/impersonations` (history)
- **/admin/settings** — Platform Settings (global config, breakage owner default, rate limits, data retention)
- **/admin/feature-flags** — Feature Flags & Experiments (`/feature-flags/:flagId`, `/feature-flags/:flagId/audit`, `/experiments`, `/experiments/:id/results`)

### 2.2 Brand Console (root `/`)

- **/** — Dashboard (KPIs, RFM distribution, points liability, top members, points-activity trend, **governance widget: my pending change-requests**)
- **/customers** — Customer 360 (RFM matrix list) → **member full page** `/customers/:membershipId` tabs:
  - `/overview` · `/timeline` · `/points-ledger` · `/tiers` · `/badges` · `/referrals` · `/consents` · `/notes` · `/adjustments`
- **/members** — Members (searchable/sortable/bulk, lifecycle status)
- **/earn-rules** — list → `/earn-rules/:ruleId` tabs: `/detail` · `/builder` (visual condition tree) · `/performance`
- **/campaigns** — list → `/campaigns/:campaignId` tabs: `/detail` · `/builder` (evaluation groups, stacking, budget) · `/performance`
- **/rewards** — list → `/rewards/:rewardId` tabs: `/detail` · `/performance`
- **/coupons** — list → `/coupons/:couponId` tabs: `/detail` · `/performance`; plus `/coupons/bulk-generate`
- **/vouchers** — issuance batches → generate/list/search/void
- **/segments** — list → `/segments/:segmentId` tabs: `/overview` · `/members` · `/builder` (RFM NTILE / rule DSL) · `/performance`
- **/tiers** — list → `/tiers/:tierId` tabs: `/detail` · `/members` · `/performance`
- **/badges** — `/badges/:badgeId/detail` · `/badges/:badgeId/members`
- **/challenges** — `/challenges/:challengeId/detail` · `/challenges/:challengeId/progress` (+ streaks config, leaderboards)
- **/messaging** — templates → `/messaging/:templateId` tabs: `/editor` · `/preview` · `/performance`
- **/webhooks** — endpoints → `/webhooks/:endpointId` tabs: `/detail` · `/deliveries` · `/performance`
- **/change-requests** — **My Change Requests** (status, requester, decision timeline) → `/change-requests/:id` (full diff, withdraw)
- **/reporting** — Analytics hub, tabs:
  - `/overview` · `/members` · `/revenue` · `/campaigns` · `/rewards` · `/tiers` · `/engagement` · `/exports`
  - **Deep analytics surfaces (own pages with sub-tabs):**
    - `/reporting/customers` → `/rfm-segments` · `/clv-analysis` · `/visit-frequency` · `/churn-risk` · `/onboarding-funnel`
    - `/reporting/revenue-liability` → `/breakage-forecast` · `/point-aging` · `/redemption-reserve` · `/liability-by-tier` · `/wallet-drawdown`
    - `/reporting/campaigns` → `/campaign-performance` · `/roi-lift` · `/segment-lift` · `/ab-tests` · `/scheduled-drafts`
    - `/reporting/retention` → `/cohort-retention-table` · `/retention-curves` · `/repeat-rate` · `/monthly-recurring-members`
    - `/reporting/branches` → `/branch-kpis` · `/branch-comparison` · `/channel-breakdown` · `/top-branches`
    - `/reporting/saved-views` · `/reporting/scheduled-reports`
- **/settings** — hub tabs: `/program` · `/branding` · `/points` · `/tiers` · `/notifications` · `/integrations` · `/billing` · `/data` · `/team`
- **/team** — Team & Access → `/team/:userId/detail` · `/team/:userId/activity`
- **/activity** — Audit trail → `/activity/:auditId/detail` (before/after, hash chain)

---

## 3. Analytics Catalog (metric → report page → export)

Every metric is computed off CQRS read models / rollups on the read replica, reproducible from the immutable ledger. Default export presets: **CSV** everywhere; **XLSX** (formatted + pivots) and **PDF** (charts) on dashboards; all large pulls are **async BullMQ ExportJobs** with download links + scheduled-email delivery.

| Metric | Definition (locked) | Brand page | Superadmin page | Export |
|---|---|---|---|---|
| Points issued / redeemed / expired | Ledger sums by `point_state` | /reporting/overview, /revenue | /admin/analytics/overview | CSV/XLSX/PDF |
| Redemption rate & velocity (by segment/tier) | redeemed ÷ issued, windowed | /reporting/overview, /rewards | /admin/analytics/overview | CSV/XLSX |
| **CLV — historical** | Σ(earned − redeemed) lifetime ×CPP | /reporting/customers/clv-analysis | /admin/analytics/clv | CSV/XLSX/PDF |
| **CLV — predicted 12mo** | logistic/regression on RFM + cohort age (nightly) | /reporting/customers/clv-analysis | /admin/analytics/clv, /benchmarking | CSV/XLSX |
| **Most-frequent-visitor leaderboard** | top-N by purchase count; freq histogram (1, 2–5, 6–20, 20+) | /reporting/customers/visit-frequency | — | CSV |
| Repeat-purchase rate / time-to-repeat | % members w/ 2+ purchases, avg days-to-repeat | /reporting/retention/repeat-rate | — | CSV/XLSX |
| **Cohort retention** | signup-month × retained @1/3/6/12mo (by tier/segment/channel) | /reporting/retention/cohort-retention-table, /retention-curves | /admin/analytics/cohorts | CSV/XLSX/PDF |
| Monthly Recurring Members (MRM) | members active in 2+ consecutive months | /reporting/retention/monthly-recurring-members | — | CSV |
| **Churn risk score (0–100)** | RFM signals; High/Med/Low; recommended action | /reporting/customers/churn-risk | — | CSV/XLSX |
| Onboarding funnel | Invited→Joined→1st→2nd→Tier-up dropoff & time-to-event | /reporting/customers/onboarding-funnel | — | CSV/PDF |
| RFM segment distribution | NTILE quintiles, segment counts + per-segment KPIs | /reporting/customers/rfm-segments | /admin/analytics/segments, /admin/brands/:id/rfm | CSV/XLSX/PDF |
| **Points liability (ASC 606)** | Σ(active+pending) × CPP × (1 − URR) | /reporting/revenue-liability | /admin/reports/liability | CSV/PDF/journal-entry-CSV |
| **Breakage forecast** | Monte-Carlo expiry projection + confidence bands, redemption-rate sensitivity | /reporting/revenue-liability/breakage-forecast | platform rollup | CSV/PDF |
| Point aging | 7-bucket schedule + expiry calendar heatmap | /reporting/revenue-liability/point-aging | — | CSV/XLSX |
| Redemption reserve | gross liability, est. breakage %, recommended reserve %, gap vs wallet | /reporting/revenue-liability/redemption-reserve | — | CSV/PDF |
| Liability by tier | stacked distribution + tier-migration risk | /reporting/revenue-liability/liability-by-tier | — | CSV/XLSX |
| **Campaign ROI / incremental lift** | (incremental_spend − issued_cost) ÷ issued_cost; lift vs control | /reporting/campaigns/roi-lift, /segment-lift | /admin/brands/:id/campaigns | CSV/XLSX/PDF |
| A/B test results | variant comparison + statistical significance | /reporting/campaigns/ab-tests | /admin/experiments/:id/results | CSV |
| Per-branch KPIs / comparison | sales, members, active %, points, avg spend, rank | /reporting/branches/* | — | CSV/XLSX |
| Channel breakdown (online vs in-store) | txn %, spend %, acquisition + redemption channel, cross-channel | /reporting/branches/channel-breakdown | — | CSV/XLSX |
| Gamification engagement | badge adoption, challenge completion, streaks, referral conversion | /reporting/engagement | — | CSV |
| **Platform revenue / MRR** | markup + fees recognized per period | — | /admin/wallet-billing/revenue, /admin/reports/revenue | CSV/PDF |
| Wallet funding runway | balance ÷ daily drawdown, per group | — | /admin/wallet-billing, /admin/reports/wallet-funding | CSV |

**Cross-cutting analytics affordances (all surfaces):** date-range picker w/ presets + comparison (prior-period / YoY); segment/tier/branch/channel filters; **Saved Views** (pin to sidebar); **Scheduled Reports** (daily/weekly/monthly, timezone-aware, recipient list, format); drill-down from any chart segment/table row to the underlying member list (which links to Customer 360).

---

## 4. Governance Model (maker-checker) — implementation-ready

### 4.1 Modes (per-brand default, per-capability override)
- **AUTONOMOUS** — direct CRUD (current behavior; backfill default). Maker = checker.
- **APPROVAL_REQUIRED** — brand may author edits but they queue as change-requests; entity shows a **"Pending approval"** badge; superadmin (or a brand checker, if intra-brand approval is later enabled) decides.
- **SUPERADMIN_MANAGED** — brand is read-only; the only mutating affordance is **"Submit for change"**; superadmin applies all changes.

Resolution order at request time: `governance_config(brand_id, entity_type)` → `governance_config(brand_id, NULL)` (brand default) → `AUTONOMOUS`.

### 4.2 Data model (additions)
- `brand.governance_mode enum(AUTONOMOUS|APPROVAL_REQUIRED|SUPERADMIN_MANAGED) DEFAULT AUTONOMOUS`
- `governance_config(id, platform_id, group_id, brand_id, entity_type NULL, governance_mode, created_at, updated_at)` — `entity_type=NULL` is the brand default; rows override per capability (earn_rule, campaign, reward, tier, coupon, segment, badge, challenge, template, webhook, settings).
- `change_request(id, platform_id, group_id, brand_id, entity_type, entity_id NULL, action enum(create|update|delete), proposed_payload jsonb, current_snapshot jsonb, status enum(PENDING|APPROVED|REJECTED|WITHDRAWN), reason varchar(500), requester_id, reviewer_id NULL, decision_reason, requested_at, reviewed_at, created_at, updated_at)` — `brand_id`+`group_id` denormalized for flat RLS.
- `change_request_diff(id, change_request_id, entity_type, path, old_value, new_value)` — normalized field-level diff for rendering.
- `governance_notification(id, change_request_id, actor_id, event_type, read_at, created_at)` — in-app receipt tracker.
- `audit_log.governance_context_id` (FK → change_request) — links approval decisions into the existing hash-chained audit.

### 4.3 API branching (single choke point)
Wrap all brand mutating routes (`POST/PATCH/DELETE /v1/manage/:entity_type[/:id]`) in a **GovernanceInterceptor** that resolves the effective mode:
- **AUTONOMOUS** → execute normally.
- **APPROVAL_REQUIRED** → do **not** mutate; create `change_request` (snapshot current state + compute diff), publish outbox `change_request.created`, return **409** with `{ change_request_id }`.
- **SUPERADMIN_MANAGED** + brand actor → for edit endpoints return **403** with `{ canSubmit: true }`; the explicit `POST /v1/manage/change-requests` path still creates a request.
- Dedicated routes:
  - Brand: `POST /v1/manage/change-requests`, `GET /v1/manage/change-requests?status=&entity_type=`, `GET /:id`, `DELETE /:id` (withdraw; PENDING + requester/brand-admin only → status=WITHDRAWN).
  - Superadmin: `POST /v1/admin/change-requests/list`, `GET /:id`, `PATCH /:id/approve`, `PATCH /:id/reject {decision_reason}`, `POST /bulk-approve`, `POST /bulk-reject {ids[], decision_reason}`, `PATCH/GET /v1/admin/brands/:id/governance`, `GET /v1/admin/brands/:id/governance/audit`, `GET /v1/admin/governance-stats`.
- **On APPROVE:** apply `proposed_payload` to the entity inside one tx, write `audit_log` with `governance_context_id`, publish `change_request.approved`. **On REJECT:** set `decision_reason`, do not apply, publish `change_request.rejected`. Bulk = loop + per-item result summary `{approved, failed, errors[]}`.

### 4.4 RLS
`change_request` policy: `(brand_id = current_tenant().brandId AND requester_id = current_user_id) OR current_is_superadmin`. Superadmin sees all; brand sees only its own. `governance_config` superadmin-write, brand-read-own.

### 4.5 Both UIs
- **Superadmin:** `/admin/merchants/:groupId/governance` (mode editor: brand default radio + per-capability override table) · `/admin/approvals` (queue, multi-select, SLA aging >24h warning) · `/admin/approvals/:id` (full-page side-by-side diff from `change_request_diff`, requester info, approve/reject with reason modal, audit timeline) · `/admin/governance-dashboard` (pending count, approval rate, avg decision time).
- **Brand:** entity rows/detail show **"Pending approval"** badge when an open request exists; edit buttons become **"Submit for change"** under SUPERADMIN_MANAGED; on 409 the UI confirms "Submitted for approval" and routes to `/change-requests/:id`; `/change-requests` lists status + decision; toast on decision (outbox → in-app notification). Detail diff pages are full pages (bookmarkable); only the approve/reject **reason** is a modal.

### 4.6 Migration
Add `governance_mode` with default AUTONOMOUS, backfill all brands → no behavior change. `governance_config` empty initially (opt-in per capability).

---

## 5. Data Model Additions (consolidated)

**Governance:** `governance_config`, `change_request`, `change_request_diff`, `governance_notification`; `brand.governance_mode`; `audit_log.governance_context_id`.

**Platform / billing / entitlements:** `Plan`, `Invoice`, `BillingContact`, `NotificationConfig`, `PlatformSettings` (formalized), `FeatureFlag`, `FeatureFlagChange`, `FeatureFlagTargetingRule`, `Experiment`.

**Platform services:** `NotificationProvider` (+`.rotations`), `NotificationTemplate`, `NotificationTrigger`, `NotificationDelivery`; `WebhookEndpoint` (+`.rotations`), `WebhookDelivery`, `WebhookDeliveryAttempt`; `ApiKey` (extend) + `ApiKeyAccess`; `IntegrationMarketplace`/`IntegrationInstallation` + `IntegrationSyncLog`; `RbacRole`/`RbacPermission`/`RbacRolePermission`/`RoleAssignment` (formalize); `SsoConfiguration`, `MfaPolicy`, `PasswordPolicy`, `SessionPolicy`; `DataSubjectAccessRequest`, `RightToBeForgottenRequest`, `CustomerConsent`; `TranslationString`, `RegionalSettings`; `ImpersonationSession` (extend).

**Brand domain (new modules):** `SegmentDefinition`, `CouponCode`, `NotificationTemplate` (brand-scoped reuse), `TeamMemberRole`.

**Analytics read models (materialized, nightly BullMQ, idempotent upserts):** expand `BrandDailyMetric` (aov, channel distribution, top-member); `RfmSnapshot` (+churnRiskScore, predictedChurn30d, clvHistorical, clvPredicted); new `CustomerLifetimeValue`, `ChurnRiskScore`, `OnboardingFunnelStage`, `BreakageForecast`, `PointAgingBucket`, `RedemptionReserve`, `CohortRetention`, `BranchMetric`, `ChannelBreakdown` (view), `CampaignMetric`/`CampaignPerformance` (expand), `SegmentPerformance`, `RewardPerformance`, `TierPerformance`, `BadgePerformance`, `ChallengePerformance`, `ReferralPerformance`; platform read models `ClvMetric`, `VisitFrequencyMetric`, `PlatformDailyMetric`; `SavedView`, `ScheduledReport`, `ExportJob`.

**Enums added:** `GovernanceMode`, `ChangeRequestStatus`, `ChangeRequestAction`, `PlanTier`, `NotificationChannel`, `ProviderType`, `DsrStatus`, `ErasureStatus`, `ConsentChannel`, `FeatureFlagStatus`, `RiskLevel`, `AgeBucket`, `ExportFormat`, `ScheduleFrequency`. All new tenant-scoped tables carry `brand_id` or `group_id` + RLS USING/WITH CHECK; platform tables carry `platform_id`.

---

## 6. Coverage Matrix (proof of 100%) + Beyond

| Domain capability | Wave-1 state | Plan coverage |
|---|---|---|
| Core engine / ledger / FIFO / terminal API / RLS / auth / PII / audit / outbox | have | retained, untouched |
| Brand CRUD (rules/rewards/tiers/campaigns/badges/challenges) | have | + visual builders, performance subpages |
| Customer 360 | partial (drawer) | **full page + 9 subpages** |
| Coupons / Vouchers | missing/partial | **full module + bulk-generate** |
| Segments & Audiences | missing | **builder + members + performance** |
| Messaging & Templates | missing | **module + editor/preview/performance + providers** |
| Brand Team & RBAC | missing | **team module + per-user activity** |
| Brand Webhooks | missing | **endpoints + deliveries + replay + performance** |
| Settings (multi-subpage) | partial (1 page) | **9-subpage hub** |
| Brand Reporting depth (CLV, cohort, visit-freq, churn, funnel, branch, channel) | partial | **full analytics catalog + exports + saved views + scheduled reports** |
| Exports XLSX/PDF + scheduling | partial (CSV) | **async XLSX/PDF + email scheduling** |
| Superadmin Dashboard | partial | deep dashboard w/ governance + ops alerts |
| Superadmin Merchants 360 | have (drawer) | **9-subpage detail hub (pages)** |
| Wallet & Billing platform hub | missing | **statements/auto-topup/alerts/revenue** |
| Brand Directory (cross-merchant) | missing | **directory + brand analytics** |
| Plans & Pricing / entitlements | missing | **plans + assignments + overage** |
| **Governance / maker-checker** | missing | **§4 — modes, change_request, API branching, both UIs** |
| Approvals Queue + bulk + diff | missing | **full module** |
| Platform Analytics (cohort/CLV/RFM) | partial | **full + benchmarking** |
| Platform Services (notifications/webhooks/api-keys/integrations) | partial | **full hub** |
| Team & Roles (platform RBAC) | partial | **users/roles/permissions/audit** |
| Auth/SSO/MFA/password/session config | partial | **full auth module** |
| Audit Log Viewer (platform) | partial | **viewer + chain-verify + export** |
| Impersonation / Support Console | partial | **search + session + history** |
| GDPR/DSR/erasure/consent/lineage | partial | **compliance module** |
| Localization (EN/AR/RTL/regional) | partial | **localization module** |
| Platform Settings / Feature Flags / Experiments | missing | **settings + flags + A/B** |

**Beyond the plan (industry-leader parity we deliberately add):** predictive churn & CLV (ML), A/B testing with significance, redemption reserve / breakage Monte-Carlo with accounting reserve, branch + channel + cross-channel analytics, saved views + scheduled email reports + ad-hoc query builder, integrations marketplace (Square/Toast/Shopify/Segment/Klaviyo), SSO/SAML/OIDC + passkey, full GDPR DSR/erasure/lineage/dry-run, multi-language EN/AR + RTL, **per-capability governance granularity** (a brand can be APPROVAL_REQUIRED on campaigns but AUTONOMOUS on tiers), governance SLA dashboards, feature flags + targeting + kill switches.

---

## 7. Build Roadmap (sequenced waves)

Foundations before breadth: governance + page-shell refactor + analytics backend first, because every later wave renders inside the shell, respects governance, and reads from rollups.

- **W2 — Governance Foundation + Page-Shell Refactor (FIRST INCREMENT — BUILD NOW).** Ship the maker-checker spine end-to-end on the entities that already exist (no new domain modules yet). Deliverables: migration (`governance_mode` backfill AUTONOMOUS, `governance_config`, `change_request`, `change_request_diff`, `governance_notification`, `audit_log.governance_context_id`) + RLS; **GovernanceInterceptor** wrapping all `/v1/manage` mutations with 409/403 branching; brand `POST/GET/DELETE /change-requests`; superadmin approve/reject/bulk + `/brands/:id/governance`; outbox events + in-app notification; superadmin `/admin/approvals`, `/admin/approvals/:id` diff page, `/admin/merchants/:groupId/governance`, `/admin/governance-dashboard`; brand `/change-requests`, pending badges, "Submit for change". **In the same wave:** introduce the reusable **page-shell + sub-route layout** (list→detail-with-tabs, breadcrumb, hero-card, performance-tab scaffold) and **promote Customer 360 and Merchant 360 from drawers to full pages with their subpage tabs** — this is the structural pattern every later wave consumes. Gate: existing 23 e2e green + new governance e2e (409 queues, 403 read-only, approve applies + audits, RLS isolation of change_requests).

- **W3 — Analytics Backend & Rollups.** Read models + nightly BullMQ workers (idempotent upserts) for CLV (historical+predicted), churn risk, cohort retention, visit frequency, onboarding funnel, breakage forecast, point aging, redemption reserve, liability-by-tier, branch/channel, campaign ROI/lift; expand `BrandDailyMetric`/`RfmSnapshot`. All endpoints off read replica with perf targets (<200ms list, <500ms charts). `ExportJob` infra (CSV/XLSX/PDF), `SavedView`, `ScheduledReport`. No new UI yet — backend + contract tests + reconciliation (rollup-vs-raw).

- **W4 — Brand Console Breadth A (config modules).** New modules behind governance + page-shell: Coupons (+ bulk-generate), Segments (+ builder), Messaging/Templates, brand Webhooks, brand Team & Access, 9-subpage Settings hub, Vouchers. CRUD + detail pages + governance integration. Visual builders (earn-rule, campaign, segment) as full-page canvases.

- **W5 — Brand Reporting Hub.** Render the full §3 analytics catalog: `/reporting/*` overview/members/revenue/campaigns/rewards/tiers/engagement/exports + deep customers/revenue-liability/campaigns/retention/branches sub-tabs; date-range/comparison/filters, drill-downs, saved views, scheduled reports, performance subpages on every entity.

- **W6 — Superadmin Platform Breadth A.** Wallet & Billing hub (statements, auto-topup, low-balance alerts, revenue/MRR + invoices), Brands Directory + Brand Analytics, Plans & Pricing + assignments/overage, Platform Analytics (cohorts/segments/CLV/benchmarking/exports + ad-hoc query builder).

- **W7 — Platform Services & Security.** Platform Services hub (notifications providers/templates/triggers/delivery-log; webhooks endpoints/deliveries/DLQ/events; API-keys lifecycle + access audit; integrations marketplace + installed/sync), Platform Team & RBAC, Auth/SSO/MFA/password/session config, Audit Log Viewer + chain-verify, Support Console + Impersonation.

- **W8 — Compliance, Localization, Flags & Polish.** GDPR/DSR/erasure/consent/data-lineage + dry-run; Localization (EN/AR, RTL, translations, regional settings); Feature Flags + targeting + experiments/A/B results; Platform Settings; observability dashboards (reconciliation drift, DLQ, outbox lag, wallet runway, OTP abuse); E2E Playwright journeys across both consoles; final coverage + accessibility + design-system audit.

**Critical path:** W2 (governance + shell) → W3 (analytics backend) gate everything; W4/W5 (brand) and W6/W7 (superadmin) can parallelize once W2+W3 land; W8 closes compliance/i18n/flags.

**Build now:** W2 — start with the governance migration + `GovernanceInterceptor` + the `change_request` approve/apply path (the single highest-leverage primitive, since it is the owner's explicit control requirement and a hard dependency for safely opening edit surfaces in every later wave), landed together with the reusable page-shell and the Customer-360 / Merchant-360 drawer→page conversion.

---

## 8. Terminal / POS Integration (field intel — RetailClub/Lazord)

RFM consumes the **RetailClub Integration API by Lazord** today (`/api/Account/Login`, `/api/LoyaltyIntegration/{CheckOut,ReturnCheckOut,CheckInvoiceExistence}`). We **replace and exceed** it — not copy it — but our terminal-gateway must drive **RFM's physical Payment Terminals**, so the POS operations they perform are first-class deliverables in the terminal wave (implemented our way, on the double-entry ledger):
- **Combined checkout** — one atomic call that earns on `purchaseAmount` and redeems `redemptionAmount`, returns updated balance + customer loyalty snapshot (vs their single CheckOut). We keep our richer `quote` + `authorize→capture→void` as the advanced path; combined checkout composes them atomically.
- **Invoice-based idempotency** + an existence probe (their `InvoiceNumber` + `CheckInvoiceExistence`), in addition to our `Idempotency-Key`.
- **`cashierId`** captured on every terminal transaction (reconciliation/fraud).
- **Partial returns** against a prior checkout (their `ReturnCheckOut` with `ReturnAmount`) — ours is currently full void only.
- **Reservation/hold TTL** per transaction (their `ReservationPeriod`).
- Multi-country + `deviceLanguage` (EN/AR) — ties into the localization module.
We retain our advantages they lack: HMAC + nonce replay protection, quote preview, explicit authorize/capture/void state machine, offline store-and-forward batch replay, opaque member-resolve tokens. A terminal **SDK + migration path** lets the existing fleet re-point to our engine. (Reference: docs intel from the Master Merchant Postman collection.)

Relevant existing files this plan extends (absolute paths): `C:\Users\user\Desktop\RFM Loyalty Engine\packages\db\prisma\schema.prisma` (add §5 tables/enums + `prisma\sql\rls.sql` policies), `C:\Users\user\Desktop\RFM Loyalty Engine\apps\api\src\modules` (new `governance`, `coupons`, `segments`, `messaging`, `platform-services` modules; extend `reporting`, `superadmin`), `C:\Users\user\Desktop\RFM Loyalty Engine\apps\api\src\platform-core\audit` (add `governance_context_id`), `C:\Users\user\Desktop\RFM Loyalty Engine\apps\web-brand\app\(app)` (add change-requests, coupons, segments, messaging, webhooks, team, reporting, expand settings + customers→full pages), `C:\Users\user\Desktop\RFM Loyalty Engine\apps\web-superadmin\app\(app)` (add all §2.1 pages beyond merchants), `C:\Users\user\Desktop\RFM Loyalty Engine\docs\05-roadmap.md` (supersede Wave-2+ section with W2–W8 above).