---
title: Changelog
description: What changed in the API and in this documentation.
---

## 2026-09-23

- Documentation portal published, replacing the single-file reference.
- Full per-endpoint reference with request and response fields, examples and errors.
- Documented `items` on quotes and transactions for SKU-targeted earn rules.
- Documented `kind` on voucher responses, the receipt response body, the 200-operation batch limit, and that a replayed transaction omits `completed`, `stamps` and `bonuses`.
- Clarified that successful `POST` calls return `201`.
- Added a C# signing example.

## API version 1

Versioned by path (`/v1`). Fields are only ever added, never removed or renamed, within a version. New optional request fields and new response fields do not constitute a breaking change; build your parser to ignore fields it does not know.
