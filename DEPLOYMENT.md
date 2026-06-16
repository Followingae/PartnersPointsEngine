# Going live — Partners Points

Three things get deployed from this one repo:

| What | Where | Address |
|------|-------|---------|
| Brand console (`apps/web-brand`) | Vercel | `platform.partnerspoints.ae` |
| Superadmin console (`apps/web-superadmin`) | Vercel | `superadmin.platform.partnerspoints.ae` |
| API + workers (`apps/api`) | DigitalOcean App Platform | `api.partnerspoints.ae` |

Your existing **marketing** site on `partnerspoints.ae` is a separate Vercel project and is **not touched** by any of this.

---

## 0. One-time: rotate the DB password
The Supabase DB password was shared in chat, so **rotate it** first
(Supabase → Project → Settings → Database → Reset database password).
Use the new password everywhere below. Never put it in the repo — only in the
DigitalOcean dashboard.

---

## 1. Database (Supabase) — apply the schema once
From your machine, with the **new** Supabase connection string:

```bash
# pooled (6543) for runtime; direct (5432) for this one-time apply
export DIRECT_URL="postgresql://postgres.<ref>:<NEW_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
pnpm --filter @rfm-loyalty/db db:apply
```

This creates all tables, the row-level-security policies, and the ledger
integrity triggers. (It does **not** load demo data — production starts clean.)

---

## 2. API → DigitalOcean App Platform (Docker, NOT Functions)

> The earlier failure (`runtime 'typescript:default' is not supported`) happened
> because DO tried to deploy the repo as **Functions**. We deploy it as a
> **Docker web service** instead, using the app spec below.

**Easiest path — create from the app spec:**
1. Install `doctl` and log in, then:
   ```bash
   doctl apps create --spec .do/app.yaml
   ```
   (or in the dashboard: **Create App → choose the repo → "Edit App Spec" →
   paste `.do/app.yaml`**. Do **not** accept the auto-detected "Functions"
   component.)
2. In the app's **Settings → App-Level Environment Variables**, add these as
   **encrypted** secrets (values from Supabase / your generated keys):
   - `DATABASE_URL`  → Supabase pooled (6543, `?pgbouncer=true`)
   - `DIRECT_URL`    → Supabase direct (5432)
   - `APP_DATABASE_URL` → the `loyalty_app` role (or reuse `DATABASE_URL` to start)
   - `REDIS_URL`     → a DO Managed Valkey/Redis database
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` → long random strings
   - `PII_MASTER_KEY_BASE64` → a base64 32-byte key:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. Deploy. Health check is `GET /health`. Once green, add the custom domain
   `api.partnerspoints.ae` (Settings → Domains).

---

## 3. The two consoles → Vercel (two new projects)

Both are normal Next.js apps with no special build needs. For **each** console
create a **new** Vercel project from the `PartnersPointsEngine` repo:

| Setting | Brand project | Superadmin project |
|---|---|---|
| **Root Directory** | `apps/web-brand` | `apps/web-superadmin` |
| Framework | Next.js (auto) | Next.js (auto) |
| Domain | `platform.partnerspoints.ae` | `superadmin.platform.partnerspoints.ae` |

> Setting **Root Directory** is the important bit — it stops Vercel from trying
> to build the API (the cause of the earlier `Response` build error).

Environment variables (Project → Settings → Environment Variables):
- **Both** projects: `NEXT_PUBLIC_API_URL = https://api.partnerspoints.ae/v1`
- **Superadmin** also: `NEXT_PUBLIC_BRAND_URL = https://platform.partnerspoints.ae`

---

## 4. DNS (at your domain registrar / DNS host)
- `platform`               → CNAME → `cname.vercel-dns.com`
- `superadmin.platform`    → CNAME → `cname.vercel-dns.com`
- `api`                    → the DigitalOcean app's domain target (DO shows it)
- `@` / apex (`partnerspoints.ae`) → leave on the marketing project, unchanged

---

## Order of operations
1. Rotate DB password → 2. Apply schema to Supabase → 3. Deploy API on DO + set
secrets + domain → 4. Create the two Vercel projects + env vars + domains →
5. Add DNS records. Done.
