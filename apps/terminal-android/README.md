# RFM Terminal — merchant loyalty app for Feitian SmartPay terminals

Cashier-facing Android app (`ae.rfmloyaltyco.terminal`) that runs **on the Feitian
payment terminal** next to the SmartPay payment app. Customer recognition, point
awarding, redemptions at checkout, refunds/voids, offline store-and-forward — in the
merchant-console visual language (ink/lime, Bricolage Grotesque + Hanken Grotesk).

Full design + research: [`docs/terminal-app-spec.md`](../../docs/terminal-app-spec.md).

## Build

Uses the same toolchain as the RFM Merchant Hub (`~/.rfm-android-tools`: JDK 17,
Android SDK 34, Gradle 8.7):

```powershell
$env:JAVA_HOME = "C:\Users\user\.rfm-android-tools\jdk\jdk-17.0.19+10"
$env:ANDROID_HOME = "C:\Users\user\.rfm-android-tools\sdk"
& "C:\Users\user\.rfm-android-tools\gradle\gradle-8.7\bin\gradle" assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk` — signed with the fleet
`rfmhub` keystore (same as the Merchant Hub, so it can ship over the Hub's OTA
channel or `adb install`).

The Feitian **ECR SDK v1.2.2 AAR** is vendored at `app/libs/ecr_sdk_1_2_2.aar`.

## First-run setup on a terminal

1. **SmartPay side (once per device):** SmartPay → login `admin` → Settings → **ECR**
   → enable the socket/TCP mode (on PC-docked setups Feitian uses `USB_TYPEC`; for
   the on-terminal app use the socket option). Feitian's `ECR_Demo_1.2.1…apk` is a
   good smoke test that the ECR link works before pointing this app at it.
2. **Pair the terminal:** superadmin console → merchant → terminals → *Issue key*
   (`POST /v1/admin/terminals/:id/keys`). Scan the provisioning QR on the app's
   pairing screen (or type the `pk_…`/`sk_…` values). The secret is stored encrypted
   with the device keystore.
3. **Settings (PIN, default `4321`):** ECR transport `socket · 127.0.0.1`
   (or `demo` to trial the flow with simulated approvals), earn basis, redemption
   rate/presets.

## Checkout flow (cashier)

New sale → amount keypad → **Charge** → customer step (phone last digits / member QR /
skip — never blocks payment) → member card with tier, balance and live earn preview →
one-tap redemption chips (points → AED off) → **Card** (drives SmartPay via ECR
`purchase` on the net amount) or **Cash** → approved: redemption hold captured + earn
posted → success screen with points earned and new balance (auto-returns to idle).

Failure handling: declined/cancelled/timeout voids the redemption hold and keeps the
sale live for retry; loyalty API failures after an approved payment are queued in the
offline outbox and replayed idempotently; a killed app voids dangling holds on
relaunch. Redemptions are never allowed offline.

## Backend surface used

`/v1/terminal` (HMAC-signed, mirrors `packages/sdk-terminal`): `members/resolve`,
`members/context` *(added with this app)*, `quotes`, `transactions` (+ `capture`,
`void`, poll, `batch`). Terminal key issuance: `POST /v1/admin/terminals/:id/keys`
*(added with this app)*.

## Redemption valuation (server-owned)

Points→money pricing is owned by the engine: brand admins set the rate on the
**Earn rules** page of the brand console ("Pay with points": N pts = AED X, minimum
redemption, max % of bill, rounding step, POS preset chips). The terminal pulls it
from `GET /v1/terminal/config` at startup (cached for offline restarts), and
`POST /v1/terminal/quotes` prices redemptions server-side with the same math
(`redemptionValueMinor` in `loyalty.service.ts` ⇄ `RedemptionRate.valueMinor` in the
app — unit-tested to agree case-for-case).

## Receipts

The app prints its own branded loyalty receipts through the Feitian device SDK
(`ServiceManager` → `Printer`, vendored `app/libs/ftsdk_api_1_0_1_11.jar`): 384-dot
bitmap rendered with the console fonts — brand header, amounts with points discount,
a framed loyalty block (+points, balance), order-reference QR, torn-edge footer.

Printing is a synchronized animation: the exact bitmap being printed slides up off
the top of the screen at the thermal head's real feed rate (~70 mm/s → duration
computed from bitmap height) while the paper emerges from the slot above the display;
the hardware callback snap-finishes the animation. Auto-print on approval is a
settings toggle; any past transaction reprints from History. Demo mode simulates the
same timing with no printer service.

## Notes / limitations

- Loyalty clawback on refunds is a back-office step (terminal surface has no
  `reverse` yet); refund records carry a reminder note.
- QR scanning uses CameraX + ZXing (no Google Play Services needed). If the terminal
  has no camera, phone lookup and manual pairing still work.
