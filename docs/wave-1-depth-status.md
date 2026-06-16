# Wave 1 — Depth Closure ("make it a product, not a demo")

Closes the gap surfaced by the depth audit (`docs/` gap analysis): the platform was
**create-only and read-only** — verified `21 GET / 23 POST / 0 PUT / 0 PATCH / 0 DELETE`.
Every screen was a create modal over a dead table; the superadmin product was one page.

Wave 1 makes the existing domain model **reachable, editable, observable, and operable**.

## Delivered

### Backend — the mutation/query half of the API
- **Universal CRUD** on all 6 brand entities (earn-rules, rewards, tiers, campaigns, badges, challenges):
  `GET /:id` (detail), `PATCH /:id` (partial update), `DELETE /:id`, `POST /:id/clone`.
  - Rewards delete = **soft archive** (issued vouchers reference the catalog item).
  - Badges/challenges delete cascades awards/progress; rules/tiers/campaigns hard-delete.
- **List query layer** on every list endpoint: `?q=&status=&sort=&order=&limit=&offset=` → `{ rows, total }`,
  with a sort-column whitelist (no orderBy injection).
- **Customer 360**: `GET /manage/customers/:id/profile` → balance (available/pending/lifetime),
  tier + next-tier progress %, identifiers, recent transactions, badges, referral counts.
- **Member search/filter/sort/pagination** on `GET /manage/members`.
- **Audit trail**: new `AuditService` writes a **hash-chained, append-only** `audit_log` row on every
  mutation (the table existed but was never written). Exposed via `GET /manage/audit-logs`.
- **Brand settings**: `GET/PATCH /manage/settings` (name, points label, currency, branding JSON).
- **Superadmin mutations**: merchant 360 (`GET /admin/groups/:id` — wallet posted/pending/available,
  liability, brands, cost rule), `PATCH /admin/groups/:id`, suspend/reactivate (`POST .../status`),
  `PATCH /admin/brands/:id`, **wallet ledger** (`GET .../wallet/ledger`), cost-rule version history.

### Brand console — full management, not a demo
- **Detail / edit / delete / clone** on every entity via shared create/edit forms, kebab `ActionMenu`,
  and a confirm dialog. Enable/disable toggles on rules & campaigns.
- **Customer 360 drawer** — Members and Customers/RFM rows are clickable → tabbed profile
  (Overview / Transactions / Badges) with tier-progress bar.
- **Search + sort + pagination** on members & rules; search on all entity lists.
- Richer **earn-rule builder** (effect type + value + min-spend condition + live preview) replacing the
  3-option dropdown.
- **Activity log** page (the audit trail) and **Settings** page (program + branding with live preview).
- **UX baseline**: toast notifications, field-level validation + helper text, confirm dialogs,
  loading skeletons, empty states with CTAs, slide-over drawer, sortable headers, pagination.

### Superadmin console — turned the "Coming soon" stubs into a real product
- **Merchants** page: searchable list → **merchant 360 drawer** (wallet hero, tabs: Overview / Wallet
  ledger / Cost rules / Brands).
- **Onboarding wizard** (name + currency + region → group + auto-provisioned prepaid wallet).
- **Wallet top-up**, paginated **ledger**, **cost-rule** editor (cost/point, issuance fee, margin,
  breakage owner), **add brand**, **suspend/reactivate**.

## Verification (all green)
- **Typecheck**: `tsc --noEmit` clean across the API.
- **Integration**: 23/23 vitest e2e pass — incl. new `manage-crud.e2e.test.ts`
  (reward lifecycle, tier update/delete, earn-rule validation, audit trail, customer 360,
  member search, superadmin group detail/update/suspend/wallet-ledger).
- **HTTP smoke** (`scripts/smoke.mjs`, against the compiled server): 16/16 — adds CRUD round-trip
  (create → PATCH → clone → DELETE), `{rows,total}` shape, audit entries, customer 360, settings.
- **Live**: API `:3001`, brand console `:3000` (12 routes), superadmin `:3002` (Overview + Merchants).
  Bug found & fixed during verification: `groupWallet.update` threw for pre-wallet seeded groups →
  switched to `updateMany` (no-throw on zero rows).

## Next (Wave 2 — feature breadth)
Coupon/promo-code engine · custom segment builder + campaign targeting · visual rule + discount-effect
builder + simulator · evaluation groups + budgets · tier benefits + point subledgers + manual adjust ·
real email/SMS + templates · webhook/API-key/team management UIs · reporting depth (cohort/ROI/export).
