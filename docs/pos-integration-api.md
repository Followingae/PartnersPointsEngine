# Partners Points — POS Integration API

The partner documentation now lives in the developer portal and is built from
`apps/docs/content/`:

- `apps/docs/content/guides/*.md` — Getting started, Guides and Resources pages.
- `apps/docs/content/endpoints.ts` — the per-endpoint API reference (request
  fields, response fields, examples, errors). Keep it in step with
  `apps/api/src/modules/terminal-gateway/dto.ts` and `terminal.service.ts`.

Published at https://partners-points-developers.vercel.app (custom domain
`developers.partnerspoints.ae` pending DNS). Access is gated by per-partner
codes; see `apps/docs/.env.example`.

The terminal-scoped OpenAPI document is generated from `apps/api/openapi.json`
by `apps/docs/lib/openapi.ts` and served at `/openapi.json` on the portal.
