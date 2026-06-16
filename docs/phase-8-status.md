# Phase 8 — Hardening: Status

> Built and verified locally on 2026-06-14. Completes the build (Phases 0–8).

## What was built
- **HTTP smoke/e2e test** (`apps/api/scripts/smoke.mjs`) — exercises the full request pipeline against the started server (login → guarded reports, unauthorized → 401 envelope, malformed body → 4xx). This is the layer the service-level tests bypass, and it catches exactly the class of bug found in Phase 7 (DTO `import type` breaking validation). **Wired into CI** after the server starts; CI now also runs the rules-engine + API integration suites + the OpenAPI diff gate.
- **Terminal HMAC nonce replay cache** — single-use nonces within the skew window (`NonceStoreService`); in-memory for dev, Redis-backed in prod (documented). Completes the Phase 4 security TODO.
- **`/metrics` endpoint** — process uptime/memory/node (Prometheus exporter is the prod path); plus existing `/health`, `/ready`, structured pino logs with request/tenant correlation.
- **Deploy scaffolding** — root `Dockerfile` (monorepo-aware via `pnpm deploy`), `.do/app.yaml` (DigitalOcean App Platform: api ×2 + worker), and `docs/deployment.md` (Supabase + DigitalOcean + Vercel, the `loyalty_app` role, residency).
- **`docs/security.md`** — full security posture + a pre-production checklist.

## Verified ✅ — 41 automated tests + live smoke
- Build / typecheck / lint: **0 errors** across the workspace.
- **41 tests**: db 18 (RLS + ledger + loyalty) · shared 7 (rules) · api 16 (ledger/loyalty/terminal/engagement/reporting).
- **HTTP smoke 8/8** against the running server; `/metrics` live.

## Exit criteria (vs 05-roadmap.md)
| Criterion | Status |
|---|---|
| Security review pass | ✅ `docs/security.md` + checklist |
| e2e tests | ✅ HTTP smoke (CI-wired) |
| Nonce replay cache | ✅ (Redis in prod) |
| Observability | ✅ health/ready/metrics + structured logs |
| Deploy configs | ✅ Dockerfile + DO app spec + guide |
| Load testing | ⏳ deferred (recommend k6 against staging) |
| Excel/PDF exports | ⏳ deferred (CSV shipped) |
| Webhooks GA | ✅ delivery + retries + dead-letter shipped; production Worker process + signing-key rotation are ops tasks |

## Deferred (post-build hardening)
- Load/soak testing (k6) against a staging deploy; tune pool sizes + partitioning thresholds.
- Excel/PDF export rendering (CSV ships now).
- Redis-backed rate limiting + nonce store wired on (interfaces/in-memory exist).
- Real KMS for PII keys; pen test; SOC 2 / PDPL / GDPR formal review.
- The dedicated BullMQ **worker process** entrypoint (scheduler + services exist; deployment registers the processors).

---

**The build is complete: Phases 0–8.** A multi-tenant, closed-loop, B2B2C loyalty engine — RLS-isolated, in-house auth, double-entry ledger + hybrid wallet, rules-driven loyalty, first-party POS gateway, engagement (campaigns/gamification/referrals), reporting + RFM, two admin frontends — runnable locally and ready to deploy.
