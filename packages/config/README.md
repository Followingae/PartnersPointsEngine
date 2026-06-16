# @rfm-loyalty/config

Shared build-tool presets for the monorepo.

- **`eslint/base`** — flat ESLint config for TypeScript packages.
- **`eslint/nest`** — base + NestJS (decorator/DI) relaxations.
- **`tailwind-preset`** — the RFM Loyalty design tokens (colors, gradients, radii, shadows, stat-hero type). Consumed by the admin frontends; requires `tailwindcss-animate` in the consuming app.

TypeScript base options live in the repo root `tsconfig.base.json`; each package/app extends it via a relative path (avoids the pnpm `node_modules` symlink `extends` pitfall).
