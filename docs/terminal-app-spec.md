# RFM Loyalty — Merchant Terminal App (Feitian SmartPay)

**Status:** implemented (`apps/terminal-android`) · **Date:** 2026-07-28

The cashier-facing Android app that runs **on the Feitian payment terminal itself** (F20/F300-class,
tall portrait touchscreen), next to Feitian's SmartPay payment app. It is the in-store surface of the
loyalty engine: customer recognition, earn, redemption at checkout, and payment orchestration through
SmartPay via Feitian's **ECR SDK**.

---

## 1. Hardware & SDK research summary

### 1.1 The two Feitian deliverables

| File | What it is |
|---|---|
| `Android ECR SDK (20250724) v1.22.zip` | **The actual SDK**: `ECR_SDK_1.2.2_241217151343.aar` (the library we embed), `ECR_Interface_Description_V1.0.6.doc` (protocol spec), Error Code Guide, and a sample app (source). |
| `ECR_Demo_1.2.1_250910151116.apk` | A **pre-built demo app** (compiled from that same sample) for smoke-testing the link on real hardware. Nothing to integrate from it — install it on a terminal to verify SmartPay's ECR mode works before pointing our app at it. |

### 1.2 ECR SDK API (from `ECR_Interface_Description_V1.0.6` + AAR)

Two roles: `IFtECR` (**initiator** — the cash-register side, which is what our app is) and
`IFtECRPos` (responder — SmartPay's side). Singleton: `FtECRImpl.getInstance()`.

Core initiator methods (all async, `ECRResultCallBack(int error, String data)`):

```
initialize(context, commType, cb)   release()
connect(device, cb) / autoConnect(device, cb) / disconnect(device)
purchase(device, amountMinor, orderNo, cb)        // amount in minor units (fils)
purchaseEx(device, json, cb)                       // custom fields (payment_method, country)
purchaseVoid(device, orderNo, originalNo, cb)
refund(device, amountMinor, orderNo, originalNo, cb)
preAuth / preAuthCancel / preAuthComplete / preAuthCompleteCancel
codePayment / codeRefund                           // QR-code payments
queryBalance(device, cb)   settlement(device, cb)
print(device, originalNo, cb)                      // reprint receipt
cancel(device, originalNo, cb)                     // cancel in-flight txn
transaction(device, json, cb)                      // raw JSON passthrough
```

- `orderNo`: 6–24 chars, `[0-9A-Za-z_\-*]`, unique per ECR — we use `RFM<epochSeconds><rand4>`.
- Amounts are ISO-8583 minor units (`AED 12.50 → 1250`).
- Response `data` is JSON: `error_code, trans_type (1001=purchase), trans_amount, order_no,
  trans_status (0 in-progress / 1 success / 2 fail), trans_time, card_type, card_no (masked),
  auth_no, voucher_no, batch_no, refer_no, response_code, currency_code_name, payment_method …`

Comm types (`ECRSetting`): BT3/BT4 master+slave (10–13), **socket client/server (20/21)**,
serial port variants (30–33, incl. `COMM_SERIAL_PORT_USB=32`), OTG host/accessory (41/42).
`ECRSetting.setSocketPort()` configures the socket port.

**Same-device link:** our app and SmartPay run on one terminal, so the default transport is
**socket to `127.0.0.1`** (SmartPay's ECR setting must be enabled in its admin menu — Settings →
ECR; on PC docking Feitian uses `USB_TYPEC`, on same-device deployments the TCP/socket mode).
The transport is a pluggable setting in the app (socket / USB serial / BT4 / **demo**) because we
could not verify on hardware which ECR modes this SmartPay build exposes; the demo transport
simulates approvals so the whole loyalty flow is testable with no SmartPay at all.

Key error codes: `0` success, `70` disconnect, `0x2001+` protocol, `0x3001+` transaction
(`0x3003` timeout, `0x3004` cancelled by POS, `0x3005` cancelled by ECR, `0x3024` duplicate
order, `0x3025` unknown order, `0x3026` abnormal POS status).

### 1.3 Existing fleet app

`RFM-CASE-SUBMIT/rfm-portal/android-kiosk` ("RFM Merchant Hub", `ae.rfmloyaltyco.merchanthub`)
already runs on the terminals: portrait, minSdk 24 / target 34, AGP 8.4.2, Gradle 8.7, JDK 17
toolchain at `~/.rfm-android-tools` (all reused here). It self-updates via `PackageInstaller` and
can be device owner → our APK can be shipped through the same OTA channel.

---

## 2. Backend contract (already live in `apps/api`)

Surface: `/v1/terminal/*`, auth `Loyalty-HMAC` (per-terminal key):

```
canonical = METHOD \n /v1/terminal/<path> \n ts \n nonce \n sha256hex(rawBody)
sig       = HMAC_SHA256(secret, canonical) (hex)
Authorization: Loyalty-HMAC publishableKeyId=pk_…,ts=…,nonce=…,sig=…
```

| Route | Purpose |
|---|---|
| `POST /members/resolve` `{type: phone\|email\|qr\|nfc\|loyalty_id\|card_token, value}` | → `{memberToken}` (opaque, short-lived) |
| `POST /members/context` `{memberToken}` | **added in this build** → `{displayName, loyaltyId, tier, balance:{active,available}, joinedAt}` |
| `POST /quotes` `{memberToken, amountMinor?, items?, isVisit?, redeemPoints?}` | preview → `{earn:{points,base,multiplier}, redeem:{points,affordable}?}` |
| `POST /transactions` `{intent: earn\|redeem, memberToken, idempotencyKey, amountMinor?, points?, sourceEvent?}` | earn → `captured`; redeem → `authorized` hold |
| `POST /transactions/:id/capture` / `…/void` | settle / release a redeem hold |
| `GET /transactions/:id` | definitive state poll |
| `POST /transactions/batch` | offline store-and-forward replay (deduped by idempotency key) |

Terminal identity: superadmin creates Branch → Terminal → **terminal key**
(`publishableId` + `secret`, shown once; envelope-encrypted server-side). The key issuance
endpoint (`POST /v1/admin/terminals/:id/keys`) is **added in this build** — previously keys only
existed via seed.

---

## 3. Checkout design — "seamless first"

Design goal: the cashier flow adds **≤ 2 taps** to a plain card sale, and every loyalty step is
skippable without blocking payment.

### 3.1 Happy path (member pays by card, redeems)

```
IDLE ──amount keypad──▶ SALE ──[Charge]──▶ CUSTOMER
CUSTOMER: phone last digits / QR scan / skip
  resolve + context + quote (parallel)          ~1 round trip
REWARDS: shows "Maya · Gold · 2,480 pts · earns +124"
  one-tap redemption chips (e.g. "− AED 10 · 500 pts") · default = no redemption
  [Take payment]
    redeem? → POST /transactions {intent:redeem} → hold authorized
    ECR purchase(net amount) → SmartPay takes over screen → card tapped
PAYMENT RESULT
  approved → capture hold + POST earn (single-step) → SUCCESS (+points, new balance)
  declined/timeout/cancel → void hold → back to REWARDS (retry / cash / skip)
SUCCESS auto-returns to IDLE after 6 s
```

### 3.2 Failure matrix

| Failure | Handling |
|---|---|
| Payment declined / cancelled / timeout | `void` the redeem hold immediately; sale stays live for retry, cash tender, or exit. |
| Capture/earn API call fails after payment approved | queue op in the **offline outbox**; receipt still completes; outbox replays via `/transactions/batch` with the same idempotency key (server dedupes). |
| Network down at checkout | member recognition unavailable → cashier can still take payment (loyalty skipped) or use **offline earn**: queue earn op keyed to the phone number hash for replay. Redemptions are **never** allowed offline (hold requires the ledger). |
| SmartPay link down | banner on home; sales fall back to cash tender or loyalty-only mode. |
| App killed mid-saga | in-flight txn journal persisted before ECR call; on relaunch, unresolved journals are reconciled via `GET /transactions/:id` + `void` of dangling holds. |

### 3.3 Refunds / voids

ECR `refund` / `purchaseVoid` against the original order number (picked from local history —
no re-typing). Loyalty clawback for refunds is a back-office concern (`reverse` is not exposed
on the terminal surface yet); the app records the refund locally and flags it for reconciliation.

---

## 4. App architecture (`apps/terminal-android`)

Kotlin 1.9.24 · Jetpack Compose (Material 3) · minSdk 24 · target/compile 34 · AGP 8.4.2 ·
single module `:app` · package `ae.rfmloyaltyco.terminal`.

```
app/
  ecr/        EcrTransport (interface) · FeitianEcrTransport (AAR socket/serial/BT) ·
              DemoEcrTransport (simulated approvals) · EcrResponse parsing
  api/        TerminalApi (OkHttp + HMAC interceptor mirroring sdk-terminal) · DTOs ·
              MemberContext / Quote / Transaction calls
  data/       SettingsStore (SharedPreferences + Android Keystore-backed secret) ·
              TxnHistoryStore (JSON, capped 300) · OfflineOutbox (JSON queue + replay worker)
  checkout/   CheckoutViewModel — the saga state machine (§3.1)
  ui/         Compose screens: Idle/Home · Sale keypad · Customer · Rewards · Payment ·
              Success · Refund · History · Settings (PIN-gated) · Pairing
  theme/      RFM design tokens (§5)
```

The Feitian AAR lives in `app/libs/ECR_SDK_1.2.2.aar`; `FeitianEcrTransport` binds it behind an
interface so unit tests and the demo mode never touch hardware.

## 5. UI — merchant-dashboard DNA on a tall terminal

Tokens lifted from `packages/config/tailwind-preset.cjs` / console `globals.css`:
ink `#101012`/`#17171B`, canvas `#FBFAF7`, card white, lime `#C6E23C` (500 `#B9DC2C`,
200 `#E4F49B`, 900 `#4A5A18`), coral `#FF8A7A`, blush `#FF6FA5`, teal `#73E8D4`,
sky `#5BA8FB`, destructive `#DE2626`, radius 16–32 px, soft shadows.
Fonts: **Bricolage Grotesque** (display/amounts), **Hanken Grotesk** (body),
**IBM Plex Mono** (order numbers/codes) — bundled TTFs.

Terminal-specific rules: portrait-locked; min touch target 56 dp (keypad keys 72 dp);
amounts in `stat` scale (52+ sp); single-column layouts; primary action pinned to the bottom
(thumb reach on a tall device); cashier-visible status chips for SmartPay + API link;
settings behind a PIN.

## 6. Configuration (Settings → PIN)

| Setting | Default |
|---|---|
| API base URL | `https://api.partnerspoints.ae/v1/terminal` |
| Terminal key (`pk_…` + secret) | via pairing screen (QR scan or manual) |
| ECR transport | `socket` · device `127.0.0.1` (also: USB serial, BT4, demo) |
| Earn basis | net amount (after redemption) — toggle to gross |
| Auto-print receipt | on |
| Currency | AED (fils minor units) |

Redemption valuation is **not** a device setting: it is brand-level config owned by the
engine (`redemption_config` table — rate pair, min points, max % of bill, rounding step,
POS presets), edited on the brand console's Earn rules page, served to terminals via
`GET /v1/terminal/config` (cached on-device), and applied server-side in
`POST /v1/terminal/quotes` (`redeem.valueMinor`). The app's `RedemptionRate.valueMinor`
mirrors the engine's `redemptionValueMinor` integer math exactly (unit tests on both sides).

**Receipts:** rendered on-device as a 384-dot bitmap (console typography, loyalty block,
order QR) and printed via the Feitian device SDK (`ServiceManager` → `Printer`,
`app/libs/ftsdk_api_1_0_1_11.jar`). The print UX is a synchronized animation — the same
bitmap slides off the top of the screen at the head's ~70 mm/s feed rate (duration =
bitmap height ÷ 560 dots/s) while the paper exits the slot above the display. Auto-print
toggle in settings; reprint from History.

## 7. Backend additions shipped with this app

1. `POST /v1/terminal/members/context` — member snapshot for the recognition screen
   (name, loyaltyId, tier, active/available balance, joinedAt).
2. `POST /v1/admin/terminals/:terminalId/keys` (+ revoke) — terminal key issuance from the
   superadmin console; returns `{publishableId, secret}` once and stamps `terminal.pairedAt`.

Both follow the existing module patterns (tenant-scoped Prisma, audit records, envelope-encrypted
secrets) — see `apps/api/src/modules/terminal-gateway` and `…/superadmin`.

## 8. Out of scope (deliberate)

- Loyalty reversal on refunds from the terminal (no `/reverse` on the terminal surface yet).
- Receipt printing of loyalty lines through SmartPay's printer (Feitian print API only reprints
  payment receipts; loyalty summary lives on-screen).
- NFC member cards (identifier type exists; no card program yet).
- Cart/SKU line items (API supports `items[]`; cashier UX starts amount-only like the incumbent
  RetailClub flow).
