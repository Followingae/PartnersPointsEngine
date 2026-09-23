---
title: Support
description: How to reach Partners Points integration support, and what to include so the answer is quick.
---

## Contact

Integration questions: **help@partnerspoints.ae**.

## What to include

- The `requestId` from the error response. It identifies the exact request in our logs.
- Your publishable key id (`pk_…`). **Never** the signing secret.
- The endpoint and the time of the call.
- What you expected and what you got.

## Credentials

Test credentials are issued once, scoped to a test brand. Production credentials are issued per register at go-live. Rotation is a coordinated switch per register: exactly one secret is valid at a time, so tell us before you need one.

## Status

If the API is unreachable, your register should keep taking payments and queue loyalty operations for replay. See [Offline and replay](/offline).
