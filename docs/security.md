# Security Posture

## In place
- **Tenant isolation (defense in depth):** PostgreSQL **RLS** on every tenant table (fail-closed, hierarchical, `USING` + `WITH CHECK`) + an app-layer scoping guard. The runtime connects as a **non-owner `loyalty_app`** role; tenant context is `SET LOCAL` per request transaction. Proven by the cross-tenant RLS test suite (a brand can never read/write another brand).
- **Auth, fully in-house (no third-party IdP):**
  - Admin: email + password (**argon2id**) + **TOTP MFA**, scoped JWT (access+refresh, rotation), RBAC bound to a scope node.
  - Customer: phone OTP → JWT.
  - Terminal: API key + **HMAC-SHA256** request signing over the raw body, timestamp-skew window, **single-use nonce** replay protection, encrypted per-terminal secret (envelope AES-256-GCM), rotation window.
- **PII at rest:** envelope-encrypted (AES-256-GCM) TOTP secrets + phone; phone/email stored as hashes for lookup. GDPR/PDPL erasure via crypto-shredding while the immutable ledger stays verifiable.
- **Money correctness:** append-only double-entry ledger, integer amounts, balanced-journal + non-negative DB constraints, idempotency keys, concurrency-safe (no double-spend). PCI: the loyalty engine never receives card/PAN data.
- **HTTP:** Helmet headers, CORS, global validation pipe (whitelist + forbid-unknown), single error envelope (no internal leakage in prod), structured pino logs with request/tenant correlation, `/health` `/ready` `/metrics`.
- **Audit:** append-only, hash-chained `audit_log`; transactional outbox; HMAC-signed webhooks with retries + dead-letter.

## Before production (checklist)
- [ ] Move `loyalty_app` to LOGIN with a managed secret; confirm the app uses `APP_DATABASE_URL` (RLS enforced) — never the owner.
- [ ] Real KMS for `PII_MASTER_KEY` (per-record data keys); rotate JWT + terminal secrets on a schedule.
- [ ] Redis-backed nonce store + token-bucket **rate limiting** (per-tenant, stricter on auth/OTP) wired in (interfaces exist; in-memory in dev).
- [ ] WAF / DDoS (e.g. Vercel/Cloudflare) in front; secrets scanning in CI.
- [ ] Pen test of the four surfaces; dependency audit (`pnpm audit`); SOC 2 / PDPL / GDPR review.
- [ ] Confirm no card/PAN data reaches the loyalty engine from the terminal payment app.
- [ ] Backups + PITR drills; documented RPO/RTO; per-region residency pinning where contractual.
