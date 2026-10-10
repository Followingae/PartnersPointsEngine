# 05 — Mobile (OWASP MASVS) — Customer app + Merchant terminal app

Audit date: 2026-10-10. Branch `main` @ afc3fe2. Read-only: source review of `apps/mobile` (Expo 54 / RN 0.81 / expo-router 6, bundle `ae.partnerspoints.app`) and `apps/terminal-android` (Kotlin/Compose, `ae.rfmloyaltyco.terminal`, versionCode 17 / 2.6), plus static inspection of the two release APKs committed on disk (unzipped into the session scratchpad; nothing executed). No device, no emulator, no customer-app binary (the customer app has no committed build; `apps/mobile/dist/` exists on disk but is untracked).

Method: OWASP MASVS v2 controls (STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM, CODE, RESILIENCE, PRIVACY) checked against concrete code. Severity reflects business impact for a loyalty/points platform whose tills take card payments through a separate payment app; CVSS 3.1 base vectors are given for comparability and may rank lower than the severity where the impact is irreversible (noted where so).

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | MOBILE-01 |
| High | 4 | MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05 |
| Medium | 7 | MOBILE-06, MOBILE-07, MOBILE-08, MOBILE-09, MOBILE-10, MOBILE-11, MOBILE-12 |
| Low | 4 | MOBILE-13, MOBILE-14, MOBILE-15, MOBILE-16 |
| Info | 4 | MOBILE-17, MOBILE-18, MOBILE-19, MOBILE-20 |

Headline: the terminal fleet's Android signing identity (keystore + both passwords) is in git history, and the release APKs on disk are verifiably signed with that exact key. The customer app keeps a 30-day refresh token in plaintext AsyncStorage with no secure-store dependency and no server-side logout, and its OTA JavaScript channel has no code-signing certificate, so an Expo-account compromise reaches every installed phone. On the till, the documented default admin PIN `4321` unlocks a "demo" payment mode that still posts real points to the ledger, which is an unlimited point-minting path for any cashier who reads the README.

---

## Findings

### MOBILE-01 — Fleet APK signing keystore and its passwords are committed to git; shipped APKs are signed with it

- **Severity:** Critical (CVSS 3.1 base 7.8 — severity raised because the compromised asset is an Android signing identity, which cannot be rotated without physically reinstalling and re-pairing every till)
- **CVSS:** AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H — 7.8
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/keystore.properties:1-4`, `apps/terminal-android/keystore/rfmhub.keystore`, `apps/terminal-android/app/build.gradle.kts:8-11,25-38`, `.gitignore:49-55`
- **Evidence:**
  - `git ls-files apps/terminal-android` lists both `keystore.properties` and `keystore/rfmhub.keystore`. `git log --oneline -- keystore.properties keystore/` → `c3d32f4 Merchant terminal app (Feitian SmartPay) + server-owned redemption valuation`. Both files remain tracked despite the later root `.gitignore` rule `*.keystore` (gitignore does not untrack).
  - `keystore.properties`:
    ```
    storeFile=../keystore/rfmhub.keystore
    storePassword=02c14f77a02ac69896d8aa17
    keyAlias=rfmhub
    keyPassword=02c14f77a02ac69896d8aa17
    ```
  - `keytool -list -v -keystore keystore/rfmhub.keystore` with the committed password opens it: `Alias name: rfmhub`, `Entry type: PrivateKeyEntry`, `Owner: CN=RFM Loyalty Co, OU=Merchant Hub, O=RFM Loyalty Co, L=Dubai, C=AE`, valid 2026-07-09 → 2056-07-01, 2048-bit RSA, cert SHA-256 `75:D1:D6:98:76:BE:71:9E:C5:00:4E:35:39:89:48:8D:BF:4F:23:DD:A8:24:66:DB:1E:76:34:C3:F6:B5:30:0C`.
  - `apksigner verify --print-certs -v RFM-Terminal-v2.6.apk` → `Verified using v2 scheme: true`, `Signer #1 certificate SHA-256 digest: 75d1d69876be719ec5004e353989488dbf4f23dda82466db1e7634c3f6b5300c` (identical). v2.4 verifies with the same signer. The APKs themselves are gitignored (`apps/terminal-android/.gitignore:3 *.apk`) but sit in the working tree.
  - `app/build.gradle.kts:25-38`: `signingConfigs.create("release")` reads the properties file; `buildTypes.release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("release") }`.
  - README: "signed with the fleet `rfmhub` keystore (same as the Merchant Hub, so it can ship over the Hub's OTA channel or `adb install`)" — the same key signs a second app (Merchant Hub) with its own OTA channel.
- **Impact:** Anyone with read access to the repository (every past and present collaborator, any CI runner, any leaked clone) can produce an APK that Android accepts as a same-signer upgrade of the terminal app on every till, and of the Merchant Hub app. Android's package manager is the only signature check on the device; `AppUpdater.kt` adds a SHA-256 pin, but the SHA-256 is whatever the publisher enters. The identity cannot be reissued: changing signer means uninstall → reinstall → re-pair on every terminal in the estate.
- **Exploit scenario:** Attacker with repo read clones the keystore, builds a modified terminal app (e.g. `TerminalApi.kt` with an extra copy of every `memberToken`, phone and amount sent to their host, or a `CheckoutViewModel` that captures redemptions without payment). Delivery paths: (a) a compromised or malicious `platform.manage` user registers it via `POST /v1/admin/terminal-releases` with its SHA-256 and publishes (MOBILE-12); (b) the Merchant Hub OTA channel mentioned in the README; (c) `adb install -r` on any physically reachable till — Android allows the upgrade because the signer matches. In all cases the till's hardware-keystore-encrypted HMAC secret (`SettingsStore.kt`) is now readable by attacker code running inside the signed package.
- **Fix:** Treat the key as compromised. (1) Generate a new release key offline, store it only in a secrets manager / EAS-style signing service, never in the repo. (2) Plan a fleet migration: because Android does not allow signer change on upgrade, ship a last legitimate build under the old key that can hand off pairing state, then install the new-signer build (uninstall/reinstall) during a scheduled visit per terminal, or use Android's APK Signature Scheme v3 key rotation (`apksigner rotate` + lineage) so new-key builds are accepted as upgrades — this only works because v3 lineage is trusted from the old key, so it must be done before the old key is used by an attacker. (3) Purge from history (`git filter-repo`) and force-push; invalidate all clones/CI caches. (4) Enable secret scanning in CI (`.github/workflows/ci.yml` has none).
- **Effort:** L

---

### MOBILE-02 — Customer app stores wallet access token and 30-day refresh token in plaintext AsyncStorage; sign-out never revokes them server-side

- **Severity:** High
- **CVSS:** AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N — 7.1
- **Confidence:** Confirmed (storage), Likely (Android backup inclusion — no prebuilt manifest to confirm; Expo's documented default is `allowBackup=true`)
- **Location:** `apps/mobile/lib/api.ts:1,17-20,39-49,102-116`, `apps/mobile/lib/session.tsx:43-46`, `apps/mobile/package.json` (dependencies), `apps/mobile/app.json` (`android` block), `apps/api/src/auth/controllers/customer-auth.controller.ts:45-58`
- **Evidence:**
  - `api.ts:1` `import AsyncStorage from '@react-native-async-storage/async-storage';` `api.ts:19-20` `const WALLET_TOKEN = 'pp_wallet_token'; const REFRESH_TOKEN = 'pp_refresh_token';` `api.ts:41-44`:
    ```ts
    export async function saveSession(accessToken: string, refreshToken?: string) {
      await AsyncStorage.setItem(WALLET_TOKEN, accessToken);
      if (refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN, refreshToken);
    }
    ```
  - `package.json` has no `expo-secure-store`, no `react-native-keychain`, no `react-native-mmkv` with encryption. AsyncStorage on Android is an unencrypted SQLite DB under the app's private data dir; on iOS it is JSON files in the app's Documents/Library sandbox.
  - `app.json` → `android` block contains only `package`, `edgeToEdgeEnabled`, `adaptiveIcon`; no `allowBackup: false`, no `expo-build-properties`. Expo prebuild default: `android:allowBackup="true"` → Google Auto Backup / `adb backup` (where allowed) includes the token DB.
  - System map §3: refresh TTL 30 days. `api.ts:46-49` `clearSession()` only does `AsyncStorage.multiRemove(...)` — the only sign-out path (`session.tsx:43-46`). `customer-auth.controller.ts` exposes `otp`, `verify`, `wallet`, `refresh` and no logout route; `api.ts` never calls one. The Security screen (`app/profile/security.tsx:74-89`) can revoke *other* devices only (`if (s.current || ending) return;`).
- **Impact:** Any party that can read the app sandbox (device backup, forensic extraction, malware on a rooted/jailbroken phone, a lost unlocked phone) obtains a credential that silently renews for 30 days and survives the user pressing "Sign out". With it: balances, phone, email, birthday, nationality, full activity, reward redemption (`/customer/rewards/:id/redeem`), partner conversion (`/customer/partners/convert`), account deletion request.
- **Exploit scenario:** Phone is backed up to a laptop (iTunes/Finder unencrypted backup, or Android cloud backup restored to attacker-controlled device). `pp_refresh_token` is copied, `POST /customer/auth/refresh` yields a fresh pair; attacker drains rewards/partner points for the remainder of the 30-day window. Victim's "Sign out" on their own phone does nothing to stop it; the Security screen does not list the attacker if the attacker reuses the victim's session row (rotation keeps one row per device).
- **Fix:** Store both tokens in `expo-secure-store` (Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, Android Keystore-backed) — a managed-workflow dependency, no native code. Set `android.allowBackup: false` in `app.json` (or exclude via `expo-build-properties`). Add `POST /customer/auth/logout` that revokes the current refresh row and call it from `clearSession()`; also allow revoking the current session from the Security screen. Consider shortening refresh TTL for the mobile wallet or binding it to a device-generated key.
- **Effort:** S (secure-store + allowBackup) / M (logout endpoint + session binding)

---

### MOBILE-03 — Terminal admin PIN defaults to `4321`, is published in the README, and unlocks a "demo" payment mode that still posts real points

- **Severity:** High (CVSS 5.3 — raised because it is an unbounded point-minting path with no privilege and no audit distinction)
- **CVSS:** AV:P/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:N — 5.3
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/app/src/main/java/ae/rfmloyaltyco/terminal/data/SettingsStore.kt:47,82`, `ui/SettingsScreen.kt:36-56,109,121,151`, `ecr/DemoEcrTransport.kt:19-36`, `checkout/CheckoutViewModel.kt:398-410`, `TerminalApp.kt:61-66`, `apps/terminal-android/README.md` ("Settings (PIN, default `4321`)")
- **Evidence:**
  - `SettingsStore.kt:47` `adminPin = prefs.getString(K_PIN, "4321")!!` — plaintext in `rfm_terminal` SharedPreferences; `SettingsScreen.kt:109` falls back to `"4321"` when blank.
  - `SettingsScreen.kt:52-55`: `onDigit = { if (pinEntry.length < 8) pinEntry += it; if (pinEntry == cfg.adminPin) unlocked = true }` — no attempt counter, no lockout, no delay.
  - Behind the PIN: `SettingsScreen.kt:121` offers `"intent" to "SmartPay", "demo" to "Demo"`; line 151 labels demo as "Simulated approvals for training — no real payment is taken."
  - `DemoEcrTransport.kt:19-36`: `purchase()` returns `approved = true, maskedPan = "•••• 4242", authNo = "D" + random, voucherNo = random` for any amount not ending in .13/.14/.15.
  - `CheckoutViewModel.kt:398-410` runs identically for every transport: after an approved result it calls `api.earn(member.token, earnBase, idem, orderNo)` and, earlier, `api.capture(holdId)` for a redemption hold. There is no `demo` reference anywhere in `CheckoutViewModel.kt` (grep returned none) and `sourceEvent` is just the local `orderNo`, so the server cannot tell a demo "sale" from a real one.
  - `HomeScreen.kt:69` `ecrOk = if (cfg.ecrMode == "demo") true else ...` — demo mode shows green on the idle screen.
- **Impact:** Any person at a till (cashier, temp staff, anyone who sees the README or the default) can switch to demo, "sell" AED 10,000 to their own or an accomplice's phone number, receive the full earn credit on the live ledger with a printed branded receipt, then switch back. They can also redeem/capture points against a fake sale (the hold is captured on "approval"). Settlement later bills the brand per redeemed point (system map §5), so the merchant and the group wallet carry the cost.
- **Exploit scenario:** Cashier enters `4321` → Settings → ECR "Demo" → Save. New sale AED 5,000 → enters own phone → Charge → "Approved" in 2.2 s → +points posted via `POST /v1/terminal/transactions` under the terminal's real HMAC key. Repeat. Audit log shows a normal earn from that terminal. Switch back to SmartPay.
- **Fix:** Remove demo mode from release builds (`BuildConfig.DEBUG`-gated or a separate flavour), or make the server reject earns/captures that carry a `demo` marker and have the client always send `paymentRef`/`voucherNo` from the real SmartPay result (server-side policy: no earn without a payment reference for `card` sales). Replace the default PIN with a per-terminal PIN set at pairing time (deliver it in the provisioning payload or force a change on first unlock), add attempt throttling/lockout, store a salted hash not the plaintext. Log an audit event when ECR mode changes.
- **Effort:** M

---

### MOBILE-04 — EAS Update (OTA JavaScript) has no code-signing certificate; an Expo account or token compromise pushes code to every installed customer app

- **Severity:** High
- **CVSS:** AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H — 7.8
- **Confidence:** Confirmed (config), Needs verification (which EAS tokens / Expo accounts exist and how they are protected — outside the repo)
- **Location:** `apps/mobile/app.json` (`updates`, `runtimeVersion`, `owner`, `extra.eas.projectId`), `apps/mobile/eas.json` (`build.*.channel`), `apps/mobile/package.json` (`expo-updates ~29.0.19`)
- **Evidence:**
  - `app.json`: `"updates": { "url": "https://u.expo.dev/58eef0fa-e7e1-4e99-8df5-0d08b0fa6f48" }`, `"runtimeVersion": { "policy": "sdkVersion" }`, `"owner": "following"`. No `updates.codeSigningCertificate`, no `updates.codeSigningMetadata`, no `updates.requestHeaders`. `expo-updates` is a dependency, so OTA is active in every build profile (`eas.json` channels `development`, `preview`, `production`).
  - `runtimeVersion.policy: sdkVersion` means every build on Expo SDK 54 shares one runtime version: a single malicious update on channel `production` is compatible with every production binary ever shipped on SDK 54, including store builds that had nothing to do with the attacker.
  - Memory note (`project-expo-go-preview`): the team already publishes via `eas update`, so EAS tokens exist on developer machines.
- **Impact:** Whoever holds the `following` Expo org credentials or an `EXPO_TOKEN` can replace the entire app logic on all phones at next launch without App Store / Play review: read `pp_refresh_token` from AsyncStorage (MOBILE-02) and exfiltrate, redeem rewards, convert points to Lulu, show phishing screens for card details, harvest the camera. Hermes bytecode gives no protection here because the update *is* the new bytecode.
- **Exploit scenario:** Developer laptop or CI secret leak → `eas update --branch production --message "hotfix"` with a modified `lib/api.ts` that POSTs tokens to an attacker host. Fleet-wide within hours; rollback requires another update the attacker can also push.
- **Fix:** Generate an update code-signing key pair (`npx expo-updates codesigning:generate`), set `updates.codeSigningCertificate` + `codeSigningMetadata` in `app.json`, keep the private key out of the repo and sign every `eas update` (`--private-key-path`). Pin `runtimeVersion` to an explicit string bumped on native changes so a compromised channel cannot target older binaries. Enforce 2FA on the Expo org; scope and rotate `EXPO_TOKEN`s. Consider disabling OTA for the first store release until signing is in place (`updates.enabled: false`).
- **Effort:** S

---

### MOBILE-05 — A customer's static QR / phone number is an identifier that the till can also use to spend their points; the app's own comment claims the code "can't spend anything"

- **Severity:** High (business logic; CVSS 4.9 — raised because it converts a public identifier into an authorization to debit a balance at any colluding till)
- **CVSS:** AV:P/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:N — 4.9
- **Confidence:** Confirmed by code reading; Needs verification on a live till that `quote → transactions(redeem) → capture` succeeds with a token resolved from a photographed QR (no device available)
- **Location:** `apps/mobile/app/(tabs)/scan.tsx:17-28,140,155-160`, `apps/terminal-android/.../api/TerminalApi.kt:38-41,134-148`, `ui/CustomerScreen.kt:52-89`, `checkout/CheckoutViewModel.kt:160-205`, `apps/api/src/modules/customer-wallet/wallet.service.ts:286-293`
- **Evidence:**
  - `scan.tsx:24-27` (comment): "It deliberately doesn't rotate. ... The code identifies the customer; on its own it can't spend anything." `scan.tsx:155` additionally prints the `loyaltyId` as text under the QR, and `scan.tsx:158-160` tells the customer "Or give the cashier your mobile number".
  - Terminal: `TerminalApi.kt:38-41` `resolve(type, value)` → `memberToken`; `CustomerScreen.kt:62` `vm.lookup("qr", value)` and `:85-89` `vm.lookup("phone", phone)`; `TerminalApi.kt:134-142` `redeemAuthorize(memberToken, points, ...)` and `:146` `capture(txnId)`. Nothing in the redemption path asks the customer for a PIN, OTP, in-app confirmation or possession of the device; the identifier *is* the authorization.
  - No screenshot protection on the QR screen (`FLAG_SECURE` / `expo-screen-capture` absent from the codebase — grep for `preventScreenCapture|expo-screen-capture|FLAG_SECURE` returned nothing).
- **Impact:** Anyone who knows a member's phone number, or has a photo/screenshot of their QR, can have their balance redeemed against a sale at a colluding or careless till (points → AED discount) and the member only finds out from the activity feed. The redemption also drives settlement cost to the brand. The customer-facing copy actively encourages handing over the phone number as an alternative, and the design comment is wrong about what the code grants.
- **Exploit scenario:** Cashier keeps a list of regulars' numbers; at closing, rings a AED 300 sale, enters a regular's number, taps the "Max" redemption chip (`RedemptionRate.pointsForValue`), pays the net with their own card (or demo mode, MOBILE-03), pockets the discount. Victim sees "−3000" in activity the next time they open the app.
- **Fix:** Separate identification from authorization for debits: keep the static code for *earn* (crediting the presenter is harmless), but require an in-app confirmation or a short-lived rotating code for *redeem*. Options already partially present: the server mints short-lived member tokens, so `wallet_scan_code` could return a TOTP-style value (rotating every 60 s, verified server-side) that the terminal must present for `intent: redeem`; or push an approval prompt to the phone (push infra is stubbed, `lib/push.ts`). At minimum: server-side redemption cap per terminal per member per day, member-facing notification on every redeem, and screenshot blocking on the QR screen. Correct the comment in `scan.tsx`.
- **Effort:** M (rotating redeem code) / S (caps + alerts)

---

### MOBILE-06 — Terminal provisioning secret is delivered as plaintext QR / on-screen text / clipboard, is not bound to a device, and the provisioning payload also sets the API base URL

- **Severity:** Medium
- **CVSS:** AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:H/A:N — 5.3
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/superadmin/superadmin.service.ts:919-957`, `apps/web-superadmin/app/(app)/brands/[id]/locations/page.tsx:37,178-195`, `apps/terminal-android/.../ui/PairingScreen.kt:46-62,73-83,93-99`, `data/SettingsStore.kt:62-68`
- **Evidence:**
  - `superadmin.service.ts:946-955` returns `{ ...key, secret, provisioning: { baseUrl, publishableKeyId, secret, label } }` — the raw `sk_…` twice in the JSON response.
  - Console: `page.tsx:37` `QRCode.toDataURL(JSON.stringify(issued.provisioning))`, `:188` renders `{issued.secret}` as text, `:193` `navigator.clipboard?.writeText(JSON.stringify(issued.provisioning))`.
  - Terminal: `PairingScreen.kt:52-56` parses the QR JSON and takes `baseUrl`, `publishableKeyId`/`pk`, `secret`, `label` from it; `:93-97` also accepts them typed. `SettingsStore.kt:62-68` saves whatever base URL was supplied; `TerminalApi.kt:250-252` uses it verbatim (`base + path`) with no scheme check (contrast `appVersion` at `:62`, which does enforce `https://`).
  - Server: one active key per terminal (`superadmin.service.ts:928`), but nothing ties the key to a device identity; the same QR pairs any number of devices until a re-issue.
- **Impact:** A photo of the superadmin's screen (or clipboard history, screen-share recording, browser extension) is a working terminal credential: a second device paired with it can post earns, redeem and capture for that brand/branch indistinguishably from the real till. Because the payload carries `baseUrl`, a crafted QR shown to staff ("scan this to re-pair") silently repoints a till at an attacker's host — `usesCleartextTraffic="true"` (MOBILE-07) means even `http://` is accepted.
- **Exploit scenario:** Support agent issues a key during a screen-share; the recording is later accessed. Attacker pairs a spare Android device with the JSON, runs the demo-mode flow (MOBILE-03) to credit accomplices, or redeems members' points (MOBILE-05). Revocation only happens when someone notices and re-issues.
- **Fix:** Replace the long-lived secret in the QR with a short-lived, single-use enrolment code: the console issues `enrol_…` (TTL 10 min, one redemption), the terminal exchanges it for the HMAC secret over TLS and, ideally, includes a device-generated key/attestation so the server can bind `api_key` to that device. Do not echo `secret` in the API response body twice or render it as copyable text once a QR exists. Reject non-`https://` base URLs in `PairingScreen`/`SettingsStore` unless a debug build. Show "paired devices" telemetry per key (the server already records `appSeenAt`/`appVersionCode`) and alert on two different version/user-agent fingerprints on one key.
- **Effort:** M

---

### MOBILE-07 — Terminal app allows cleartext traffic app-wide and will sign and send HMAC requests (phone numbers, member tokens, amounts) over `http://`

- **Severity:** Medium
- **CVSS:** AV:A/AC:H/PR:L/UI:R/S:U/C:H/I:L/A:N — 5.1
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/app/src/main/AndroidManifest.xml:34-37`, `TerminalApi.kt:26-29,248-269`, `SettingsStore.kt:126`, APK manifest dump (`usesCleartextTraffic=true`, no `networkSecurityConfig`)
- **Evidence:**
  - `AndroidManifest.xml:34` `android:usesCleartextTraffic="true"` with the comment "Cleartext allowed for the localhost ECR socket + LAN test APIs; production loyalty API is HTTPS." Confirmed in the shipped v2.6 binary (`aapt2 dump xmltree`: `usesCleartextTraffic(0x010104ec)=true`). No `network_security_config.xml` exists (`res/xml/` holds only `update_paths.xml`), so cleartext is global rather than scoped to `127.0.0.1`.
  - `TerminalApi.kt:26-29` plain `OkHttpClient.Builder()` with timeouts only; `:250-252` `val base = cfg.baseUrl.trimEnd('/'); val url = base + path` — any scheme accepted. Default is `https://api.partnerspoints.ae/v1/terminal` (`SettingsStore.kt:126`), but the pairing screen and QR can change it (MOBILE-06).
  - Body of `members/enroll` carries `phone` + `fullName` in clear (`TerminalApi.kt:44-48`); `members/resolve` carries the raw phone (`:38-41`); the HMAC protects integrity, not confidentiality.
- **Impact:** On a shop LAN with an `http://` base URL (misconfiguration or a malicious provisioning QR), every customer phone number, name, loyalty balance and sale amount is readable on the wire, and signed requests can be replayed within the 300 s skew window against the *other* API instance because the nonce store is per-process in memory (system map §1, `terminal-hmac.guard.ts:75-78`).
- **Exploit scenario:** Attacker on the shop Wi-Fi hands a cashier a "re-pair" QR with `baseUrl: http://api-partnerspoints.local/v1/terminal` pointing at a transparent proxy that forwards to the real API. All traffic is now logged; the proxy replays each `transactions` POST once to the second API node to double-post earns.
- **Fix:** Set `usesCleartextTraffic="false"` and add a `network_security_config.xml` that permits cleartext only for `127.0.0.1`/`localhost` (the ECR socket). Validate `https://` in `PairingScreen.kt` and `SettingsStore.savePairing`. Optionally pin the `api.partnerspoints.ae` leaf/intermediate SPKI in OkHttp's `CertificatePinner` with a backup pin, since the fleet is first-party and updates are controlled.
- **Effort:** S

---

### MOBILE-08 — Fleet update pipeline: one `platform.manage` actor publishes any `https://` URL + self-declared SHA-256; the server never verifies the APK's signature, and the device trusts only the digest

- **Severity:** Medium
- **CVSS:** AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H — 7.2 (requires superadmin; cross-reference MOBILE-01 for how the signature requirement is defeated)
- **Confidence:** Confirmed
- **Location:** `apps/api/src/modules/superadmin/superadmin.service.ts:1286-1349`, `superadmin.controller.ts:379-395`, `apps/terminal-android/.../update/AppUpdater.kt:59-110`, `apps/terminal-android/.../ui/HomeScreen.kt:70-77,117-133`
- **Evidence:**
  - `createTerminalRelease` validates only `/^[0-9a-f]{64}$/` on `sha256` and `/^https:\/\//` on `url` (`:1290-1295`); the URL host is unconstrained (any CDN, any attacker-controlled HTTPS host). `publishTerminalRelease` (`:1330-1349`) flips `publishedAt`; both are `@RequirePermissions('platform.manage')` with no second approver, no governance `ChangeRequest`, and no superadmin console page exists for it (grep across `apps/web-superadmin` for `terminal-releases` returned nothing — it is driven by raw API/Swagger calls).
  - Device: `AppUpdater.check()` compares `sha256(apk)` to the server value (`:75-86`), refuses downgrades (`:69`), enforces `https://` (`TerminalApi.kt:62`), then hands the file to the OS installer (`:99-110`). The only signature check is the OS same-signer rule. `mandatory: true` makes the prompt undismissable (`HomeScreen.kt:117`).
  - No `apksigner`-style verification server-side at registration; no requirement that the APK be hosted on a first-party bucket; no signed release manifest (the device trusts whatever `GET /app-version` returns under the terminal's own HMAC).
- **Impact:** A single compromised or coerced superadmin session (or an act-as/impersonation token with `platform.manage`) can push a build to every till in the estate within one idle-screen check. Combined with MOBILE-01 the signature requirement is already satisfied by an attacker; without it, the device would refuse the install — which is the only reason this is not Critical on its own.
- **Exploit scenario:** Attacker holding a superadmin refresh token (web-superadmin keeps it in `localStorage`, system map §6) calls `POST /v1/admin/terminal-releases` with `url: https://cdn.attacker.example/t.apk` and `sha256` of their keystore-signed build (MOBILE-01), then `POST .../publish {published:true}`, `mandatory: true`. Every paired till shows "Update to 2.7 — Install now" on the next idle screen.
- **Fix:** Two-person rule for publish (route through `ChangeRequest` governance); server-side fetch of the APK at registration to verify `apksigner`-equivalent signature against the expected signer certificate (and that `versionCode`/`package` match); allow-list the hosting origin; sign the release manifest with an offline key the device pins (`AppUpdater` verifies an Ed25519 signature over `{versionCode,url,sha256}` before download); log and alert on every publish.
- **Effort:** M

---

### MOBILE-09 — SmartPay payment result extras (masked PAN, auth number, card expiry, amount) are dumped to logcat on every transaction

- **Severity:** Medium
- **CVSS:** AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N — 5.5
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/app/src/main/java/ae/rfmloyaltyco/terminal/ecr/SmartPayIntentBridge.kt:129-130,142-163`
- **Evidence:**
  ```kotlin
  val dump = data.extras?.keySet()?.joinToString { k -> "$k=${data.extras?.get(k)}" } ?: ""
  Log.i(TAG, "SmartPay result rc=$resultCode extras{$dump}")
  ```
  The same bundle is parsed into `card_no`, `auth_no`, `card_expire_date`, `trans_amount`, `refer_no`, `batch_no`, `terminal_no`, `merchant_no`, `aid`, `tvr`, `cid`, `ac` (`:142-163`), and `allExtras()` snapshots everything SmartPay returns, including any key the parser does not know about. `Log.i` is not gated by `BuildConfig.DEBUG`; `isMinifyEnabled = false` so no R8 log stripping.
- **Impact:** On Android 4.1+ third-party apps cannot read another app's logcat, but logcat is readable via `adb logcat` on any debug-enabled till, in bug reports, and by any app with `READ_LOGS` on OEM/vendor images (Feitian terminals ship vendor services). Masked PAN + expiry + auth code + amount per sale is cardholder-adjacent data; `card_expire_date` with a masked PAN is specifically prohibited from logs under PCI DSS 3.3/3.4 unless rendered unreadable.
- **Exploit scenario:** Technician or thief with USB access runs `adb bugreport` → full sale history with masked PANs and expiry dates for the log retention window.
- **Fix:** Remove the extras dump or reduce it to the key *names* and `errorCode`; never log `card_no`, `card_expire_date`, `auth_no`, `ac`. Gate verbose ECR logging behind `BuildConfig.DEBUG`. Enable R8 (`isMinifyEnabled = true`) with `-assumenosideeffects` for `android.util.Log` in release.
- **Effort:** S

---

### MOBILE-10 — Terminal local files hold unmasked customer phone numbers, names and payment references in plaintext JSON

- **Severity:** Medium
- **CVSS:** AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N — 4.6
- **Confidence:** Confirmed
- **Location:** `data/OfflineOutbox.kt:22,27-38`, `data/HistoryStore.kt:20,25,74,104-109`, `checkout/CheckoutViewModel.kt:406,552-561`
- **Evidence:**
  - `OfflineOutbox.kt:22` `File(context.filesDir, "outbox.json")`; `:28-34` stores `identifierType`, `identifierValue` (the raw E.164 phone when the cashier typed a number — `CheckoutViewModel.kt:406` `outbox.enqueueEarn(member.identifierType, member.identifierValue, ...)`), `amountMinor`, `idempotencyKey`. Plain `file.writeText(arr.toString())` (`:105`).
  - `HistoryStore.kt:74` `txn_history.json`, 300 records (`MAX = 300`), each with `memberName`, `memberPhone` (`CheckoutViewModel.kt:561` `memberPhone = member?.takeIf { it.identifierType == "phone" }?.identifierValue` — unmasked; masking is only applied for the printed slip at `:490`), `maskedPan`, `authNo`, `voucherNo`, `grossMinor`.
  - Positive: `android:allowBackup="false"` (manifest `:33`, confirmed in APK), `MODE_PRIVATE` prefs, HMAC secret AES-GCM under AndroidKeyStore (`SettingsStore.kt:92-123`). The phone data is *not* given that treatment.
- **Impact:** A till that is stolen, resold, or serviced exposes up to 300 customers' names and phone numbers plus the pending outbox; `filesDir` is readable with root/ADB-root on vendor images. Contradicts the server-side design where phones are stored only hashed + envelope-encrypted (system map §4).
- **Fix:** Encrypt `outbox.json` and `txn_history.json` with the same AndroidKeyStore AES-GCM key already used for the secret (or `EncryptedFile` from `androidx.security:security-crypto`); store `memberPhone` masked (`maskPhone()` already exists at `CheckoutViewModel.kt:583`) and keep only the `memberToken`-independent hash the server needs; purge history older than N days; wipe files on `unpair()`.
- **Effort:** S

---

### MOBILE-11 — Customer app deep links are unverified: custom scheme is claimable by any app and the `https://partnerspoints.ae/join/<code>` form is not configured as a universal/app link

- **Severity:** Medium (Low by CVSS; raised one step because the join flow is the app's primary acquisition path and the scan/manual-entry path shares the same unauthenticated resolver)
- **CVSS:** AV:L/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N — 3.9
- **Confidence:** Confirmed
- **Location:** `apps/mobile/app.json` (`scheme`, `ios`, `android`), `apps/mobile/lib/scan-code.ts:19-44`, `apps/mobile/app/join/[id].tsx:18,31-44`, `apps/mobile/app/scan/camera.tsx:121-150`
- **Evidence:**
  - `app.json`: `"scheme": "partnerspoints"`; `ios` has no `associatedDomains`; `android` has no `intentFilters` (so no `autoVerify` App Links and no `assetlinks.json` requirement). expo-router therefore handles `partnerspoints://join/<id>` and `partnerspoints://` → any route, while `https://partnerspoints.ae/join/<code>` opens in the browser only.
  - `scan-code.ts:19-28` takes the last path segment of whatever was scanned (link, deep link or bare code) and `resolveBrand()` (`:31-44`) matches it against `brandId`, `brandSlug` or `pointsCode` of the public brand list — all non-secret values. `join/[id].tsx:36` calls `joinBrand(brandId)` after an explicit tap; re-joining is a no-op server-side.
  - What a join code grants: a membership in a brand (name + phone shared with the brand, per the sheet copy at `join/[id].tsx:69`). It is not single-use and not bound to a till; it is effectively public.
- **Impact:** Any app on the device can register the `partnerspoints` scheme and intercept join links (phishing: show a fake "Join" sheet that asks for the OTP), and because universal links are not configured, printed `https://partnerspoints.ae/join/...` codes never open the app — users land in Safari/Chrome. No points or tokens are exposed by the code itself, which keeps this out of High.
- **Fix:** Configure `ios.associatedDomains: ["applinks:partnerspoints.ae"]` and `android.intentFilters` with `autoVerify: true` for `https://partnerspoints.ae/join/*`, publish `apple-app-site-association` and `.well-known/assetlinks.json` (with the release signing cert SHA-256). Keep the custom scheme only for non-sensitive routes. Treat any route reached via deep link as untrusted input (it already is for `/join/[id]`).
- **Effort:** S (config) + S (web assets)

---

### MOBILE-12 — Terminal release build is unminified and unobfuscated; the shipped APK exposes full Kotlin symbol names, the default PIN and the API surface

- **Severity:** Medium (Low impact alone; Medium because it removes all friction from the MOBILE-01 re-signing scenario and from reverse-engineering the ECR protocol)
- **CVSS:** AV:L/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N — 4.0
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/app/build.gradle.kts:34-39`, APK inspection (`classes.dex` 30 MB, `classes2.dex` 12 MB, `classes3.dex` 2.4 MB)
- **Evidence:** `release { isMinifyEnabled = false; signingConfig = ... }`; there is no `proguard-rules.pro`. The dex strings contain `https://api.partnerspoints.ae/v1/terminal` and the complete class/method names (`SmartPayIntentBridge`, `TerminalApi`, `SettingsStore` etc.). `aapt2 dump badging` confirms the binary is *not* debuggable and `testOnly` is absent (positive).
- **Impact:** Trivial decompilation of the HMAC canonicalisation, the SmartPay intent protocol (`com.feitian.activity.readcard.InvokeActivity`, `trans_type` codes) and the settings keys. It does not by itself leak secrets (none are hard-coded besides the default PIN).
- **Fix:** `isMinifyEnabled = true`, `isShrinkResources = true`, keep rules for the Feitian AAR/JAR reflection; strip `Log` calls in release.
- **Effort:** S

---

### MOBILE-13 — Biometric "app lock" is a UI overlay driven by an AsyncStorage flag; it protects the screen, not the data

- **Severity:** Low
- **CVSS:** AV:P/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N — 2.4
- **Confidence:** Confirmed
- **Location:** `apps/mobile/lib/lock.ts:3-9,14,53-56,62-73`, `apps/mobile/components/LockGate.tsx:20,62-127`, `apps/mobile/app/profile/security.tsx:56-72`
- **Evidence:** `lock.ts:14` `const KEY = 'rfm.lock.enabled'`; `:53-56` reads/writes `'1'`/`'0'` in AsyncStorage next to the tokens. `LockGate.tsx:121-126` renders `{children}` and *overlays* `<LockScreen>` when `armed && signedIn && locked` — the children (and their network calls, e.g. `useTillWatch` polling) keep running underneath; `GRACE_MS = 30_000` re-shows content without a prompt if the app returns within 30 s. `unlock()` uses `disableDeviceFallback: false` (passcode fallback allowed). The file's own header says "This is a device-local gate, not an authentication factor" — accurate. Nothing server-side changes with the lock state.
- **Impact:** A person holding an unlocked phone sees a lock screen; a person holding the phone's file system does not need to. The Security screen presents "Face ID unlock" alongside device sessions, which may lead users to believe it secures the account. Also note the fail-open design (`security.tsx:47-49`: if hardware can no longer satisfy the lock it is shown as off).
- **Fix:** Keep the gate (it is good UX) but either (a) move token decryption behind `expo-secure-store` with `requireAuthentication: true` so the biometric actually gates key access, or (b) relabel the setting as "Hide balances until unlocked". Pause polling while locked.
- **Effort:** S

---

### MOBILE-14 — No certificate pinning in either app; both rely on the OS trust store

- **Severity:** Low
- **CVSS:** AV:A/AC:H/PR:N/UI:N/S:U/C:H/I:L/A:N — 5.4 (requires a CA-level compromise or a user-installed CA on a pre-Nougat / debug build; realistic likelihood is low)
- **Confidence:** Confirmed
- **Location:** `apps/mobile/lib/api.ts:53-63` (plain `fetch`), `apps/terminal-android/.../TerminalApi.kt:26-29`, `update/AppUpdater.kt:42` (plain `OkHttpClient.Builder().build()`)
- **Evidence:** No `CertificatePinner`, no `expo-build-properties` `networkSecurityConfig`, no `ssl-pinning` library in either dependency set. Mitigating: terminal `targetSdk 34` with no `network_security_config` → user-added CAs are *not* trusted by default; customer app is managed Expo (same default on Android; iOS ATS on).
- **Impact:** State-level or enterprise-proxy interception only. For the first-party POS fleet, pinning is cheap and the update channel is controlled, so the usual "pinning bricks the app on cert rotation" objection is weaker.
- **Fix:** Terminal: OkHttp `CertificatePinner` on `api.partnerspoints.ae` with current + backup SPKI pins, pushed via the same update channel before rotation. Customer app: optional; if adopted use `expo-build-properties` network security config pins with a backup pin and an expiry.
- **Effort:** S (terminal) / M (customer)

---

### MOBILE-15 — Terminal permission creep from the vendored Feitian SDK: shipped APK requests `BLUETOOTH_ADVERTISE`, `ACCESS_COARSE_LOCATION`, USB host/accessory features not declared in source

- **Severity:** Low
- **CVSS:** AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N — 3.3
- **Confidence:** Confirmed
- **Location:** `apps/terminal-android/app/src/main/AndroidManifest.xml:5-26` vs `aapt2 dump badging RFM-Terminal-v2.6.apk`
- **Evidence:** Source declares INTERNET, ACCESS_NETWORK_STATE, CAMERA, REQUEST_INSTALL_PACKAGES, BLUETOOTH/ADMIN (≤30), ACCESS_FINE_LOCATION (≤30), BLUETOOTH_CONNECT, BLUETOOTH_SCAN. The merged binary additionally carries `android.permission.BLUETOOTH_ADVERTISE`, `android.permission.ACCESS_COARSE_LOCATION` (no `maxSdkVersion`), and `uses-feature android.hardware.usb.accessory` / `usb.host` — contributed by `libs/ecr_sdk_1_2_2.aar` / `ftsdk_api_1_0_1_11.jar` via manifest merge.
- **Impact:** A till that advertises over BLE and can obtain coarse location is a larger attack surface and a privacy question for a device that processes customer phone numbers; none of these are used by first-party code (the default transport is `intent`, in-process).
- **Fix:** Add `tools:node="remove"` entries in the app manifest for permissions the chosen transport does not need, or `maxSdkVersion` where appropriate; review the AAR's manifest on each SDK bump.
- **Effort:** S

---

### MOBILE-16 — Customer OTP screen: client-only resend timer and auto-submit; brute-force resistance depends entirely on the API, where the `wallet` verify route has no stricter throttle

- **Severity:** Low (client); cross-reference the API report for the server-side rate limit
- **CVSS:** AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N — 5.9 (server-side; the client contributes nothing exploitable)
- **Confidence:** Confirmed
- **Location:** `apps/mobile/app/onboarding/otp.tsx:10-11,110-116,118-127,156-167`, `apps/api/src/auth/controllers/customer-auth.controller.ts:20-50`, `apps/api/src/auth/otp/otp-store.service.ts:41`
- **Evidence:** `LENGTH = 6`, `RESEND_SECONDS = 30` (client state only); `onChange` auto-submits at 6 digits; hidden `TextInput` with `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` (fine). Server: `otp` route `@Throttle({ ttl: 60_000, limit: 5 })`, `verify` route `limit: 10`, but the route the app actually uses, `POST /customer/auth/wallet` (`api.ts:198`), carries no `@Throttle` override → the global 300 req/min per IP applies, against a `randomInt(0, 1_000_000)` code valid 5 minutes (`sms-sender.service.ts:64`). No attempt counter was found in `otp-store.service.ts` (grep `attempts|maxAttempts` → none).
- **Impact:** From the mobile side nothing to fix beyond not relying on the UI; the server-side gap (1,500 guesses per 5-minute window per IP) is the API domain's finding.
- **Fix (mobile):** none required. **Fix (API, for cross-reference):** apply the `verify` throttle to `wallet`, add a per-phone attempt counter (≤5) that invalidates the code.
- **Effort:** S

---

### MOBILE-17 — Info: Expo project identifiers and App Store Connect ID are in the repo

- **Severity:** Info
- **Confidence:** Confirmed
- **Location:** `apps/mobile/app.json` (`owner: "following"`, `extra.eas.projectId: 58eef0fa-…`), `apps/mobile/eas.json` (`submit.production.ios.ascAppId: "6798199041"`)
- These are not secrets, but together with MOBILE-04 they tell an attacker exactly which Expo project and channel to target. No `credentials.json` is tracked (`apps/mobile/.gitignore` + root `.gitignore:60`), `.expo/` is untracked, `dist/` is untracked.

### MOBILE-18 — Info: Hermes bytecode and what it does not protect

- **Severity:** Info
- Expo SDK 54 ships Hermes by default; the production JS is compiled to Hermes bytecode (`.hbc`), which is not human-readable source but is decompilable to a readable form (`hbctool`/`hermes-dec`) and keeps string literals (API paths, storage keys `pp_wallet_token`, `rfm.lock.enabled`) intact. It is not obfuscation, and it offers no integrity: OTA updates replace it wholesale (MOBILE-04). No source maps are uploaded anywhere (no Sentry/Bugsnag config found; grep `sentry|analytics|amplitude|mixpanel` → none). No `console.log` in `app/`, `lib/`, `components/` (grep → none).

### MOBILE-19 — Info: Root/jailbreak, emulator and tamper detection are absent in both apps — assessed as acceptable for the threat model with one caveat

- **Severity:** Info
- Customer app: the assets are the user's own tokens and balances; root detection would be bypassable and would not change the server's trust decisions. Not recommended as a priority.
- Terminal app: runs on merchant-owned Feitian POS hardware; the real controls are the HMAC key in AndroidKeyStore (`SettingsStore.kt:92-123`), server-side policy, and the payment app's own PCI certification. A lightweight check that the app is installed from the expected signer and that `com.app.smartpay` is present (already done at `SmartPayIntentBridge.kt:48-56`) is sufficient. Caveat: once MOBILE-01 is remediated, add a runtime check that the running package's signer matches the new certificate so a sideloaded re-signed build cannot silently unpair/re-pair.

### MOBILE-20 — Info: Positive controls verified

- **Severity:** Info — see "Positive controls verified" below.

---

## MASVS control checklist

| MASVS-v2 control | Customer app (apps/mobile) | Terminal app (apps/terminal-android) | Ref |
|---|---|---|---|
| STORAGE-1 Sensitive data stored securely | **Fail** — tokens in AsyncStorage | **Partial** — HMAC secret AES-GCM/AndroidKeyStore (Pass); phones, names, auth refs in plaintext JSON (Fail); admin PIN plaintext (Fail) | MOBILE-02, -03, -10 |
| STORAGE-2 Prevent data leakage (backups, logs, clipboard, screenshots) | **Fail** — `allowBackup` not disabled (Likely), no FLAG_SECURE on QR/voucher screens; no PII logging (Pass) | **Partial** — `allowBackup=false` (Pass); logcat dumps masked PAN/expiry/auth (Fail) | MOBILE-02, -05, -09 |
| CRYPTO-1 Strong crypto, no custom primitives | N/A — no client-side crypto | **Pass** — HmacSHA256 over canonical string, SHA-256 of raw body, AES/GCM/NoPadding with cipher-generated IV, `UUID.randomUUID()` nonce (SecureRandom-backed) | TerminalApi.kt:300-307, SettingsStore.kt:105-123 |
| CRYPTO-2 Key management | N/A | **Pass (device)** — key generated in AndroidKeyStore, never exported. **Fail (fleet)** — release signing key in git | MOBILE-01 |
| AUTH-1 Authentication architecture | **Partial** — OTP + rotating refresh (Pass); no logout/revoke of own session (Fail) | **Fail** — pairing secret in plaintext QR/text/clipboard, not device-bound; default PIN `4321` | MOBILE-02, -03, -06 |
| AUTH-2 Local auth (biometric) is not the only authorization | **Pass (as documented)** — explicitly a UI gate; but mislabelled in Security screen | N/A | MOBILE-13 |
| AUTH-3 Sensitive operations re-authenticate | **Fail (design)** — static code/phone authorizes redeem at till | **Fail** — Settings PIN has no lockout; refund/void need no second factor | MOBILE-05, -03 |
| NETWORK-1 TLS for all traffic | **Pass** — `https://` default; iOS ATS untouched; Expo release manifests disable cleartext | **Fail** — `usesCleartextTraffic=true` app-wide, base URL unvalidated | MOBILE-07 |
| NETWORK-2 Pinning / identity verification | **Fail (accepted)** — no pinning | **Fail** — no pinning; release URL https-only (Pass) | MOBILE-14 |
| PLATFORM-1 IPC secure (exported components, intents) | **Partial** — custom scheme unverified, no App Links | **Pass** — only `MainActivity` (launcher) exported; FileProvider and CameraX service `exported=false`; `ProfileInstallReceiver` exported but guarded by `android.permission.DUMP` (AndroidX standard); SmartPay invoked by explicit `ComponentName`; result extras parsed tolerantly and `errorCode` (not `RESULT_OK`) is the authority | MOBILE-11; SmartPayIntentBridge.kt:74-78,121-135 |
| PLATFORM-2 WebViews | **Pass** — none | **Pass** — none | — |
| PLATFORM-3 UI leakage (screenshots, keyboard cache, overlays) | **Fail** — no `expo-screen-capture` on QR / voucher code screens; OTP input `caretHidden` + `oneTimeCode` (Pass) | **Partial** — PIN shown as dots (Pass); no FLAG_SECURE | MOBILE-05 |
| CODE-1 Up-to-date platform, no debug in release | **Pass** — Expo 54 / RN 0.81, `developmentClient` only on `development` profile | **Pass** — `compileSdk/targetSdk 34`, release not debuggable, `testOnly` absent (verified in APK) | eas.json; aapt2 dump |
| CODE-2 Hardening (minify/obfuscate/strip logs) | **Partial** — Hermes bytecode only | **Fail** — `isMinifyEnabled=false`, no ProGuard | MOBILE-12 |
| CODE-3 Third-party dependency hygiene | **Partial** — no SCA in CI (system map §1) | **Partial** — vendored Feitian AAR/JAR unversioned beyond filename; permission creep | MOBILE-15 |
| CODE-4 Update integrity (OTA) | **Fail** — EAS Update unsigned, `sdkVersion` runtime policy | **Partial** — SHA-256 + https + no-downgrade + OS signer check (Pass); publisher single-actor, signer key leaked (Fail) | MOBILE-04, -08, -01 |
| RESILIENCE-1..4 (root, debug, tamper, reverse-engineering) | **N/A (accepted)** | **N/A (accepted, with caveat)** | MOBILE-19 |
| PRIVACY-1 Data minimisation | **Pass** — camera and Face ID only, no location/contacts/notifications SDK, no analytics; `recordAudioAndroid:false` | **Fail** — unmasked phone in history/outbox; AAR adds BLE-advertise + coarse location | MOBILE-10, -15 |
| PRIVACY-2 Transparency / consent | **Pass** — join sheet states name+number shared (`join/[id].tsx:69`), Face ID usage string present | **Partial** — cashier enrolment captures phone+name at till with no on-screen consent text | — |
| PRIVACY-3 Logs/crash reports free of PII | **Pass** — no logging | **Fail** — logcat | MOBILE-09 |

---

## Not assessed

- **No device or emulator.** Dynamic checks (actual AsyncStorage file contents, Keychain attributes, screenshot behaviour, biometric fallback paths, logcat capture, whether a photographed QR actually redeems at a live till) were not run; the findings above are from source and static APK inspection.
- **No customer-app binary.** `apps/mobile/dist/` is a local Metro export (untracked, Aug 6) and no EAS build artefact is in the repo; the Expo-generated native manifests (`allowBackup`, `usesCleartextTraffic` for the `preview` profile) are inferred from Expo SDK 54 defaults — marked Likely where they matter.
- **Expo / EAS account configuration** (2FA, token scopes, who can run `eas update`) and the hosting location of terminal APKs are outside the repository.
- **Feitian SmartPay payment app** and the vendored `ecr_sdk_1_2_2.aar` / `ftsdk_api_1_0_1_11.jar` internals (closed source) — only their manifest contributions were inspected.
- **Server-side logic** reached by these clients (OTP throttling, nonce store, redemption policy, `wallet_scan_code` SQL) is referenced for context only; those belong to the API/data domains.
- **Merchant Hub app** (shares the signing key per README) is not in the monorepo.

## Positive controls verified

- Terminal HMAC secret encrypted at rest with an AndroidKeyStore AES-GCM key; random IV per encryption; decrypt failure fails closed to "unpaired" (`SettingsStore.kt:92-123`).
- Terminal request signing mirrors the server canonical form (method, path, ts, nonce, sha256(body)) with a `SecureRandom`-backed UUID nonce and per-request timestamp; server enforces 300 s skew + single-use nonce (`terminal-hmac.guard.ts:54-77`).
- Terminal updater: `https://` enforced on both client and server, 64-hex SHA-256 verified before install and re-verified for cached files, downgrade refused, FileProvider scoped to `cache/updates/` and `exported=false`, install only from the idle screen (`AppUpdater.kt`, `update_paths.xml`, `HomeScreen.kt:62-77`).
- Terminal manifest: `allowBackup=false`; only the launcher activity is exported; SmartPay invoked by explicit component; `queries` declared for package visibility; release APK not debuggable (verified with `aapt2`).
- Terminal redemption valuation is server-owned and the client math is unit-tested to match (`RedemptionRate.valueMinor`, `CoreLogicTest.kt`); redemptions are never queued offline; idempotency keys are UUIDs minted per attempt.
- Terminal `local.properties` is gitignored and contains only `sdk.dir`; release APKs are gitignored (present on disk only).
- Customer app: no hard-coded secrets, no `console.log`, no analytics/crash SDKs, no WebViews, no location/contacts permissions; camera usage string and Face ID usage string present; `ITSAppUsesNonExemptEncryption: false` declared; `recordAudioAndroid: false`.
- Customer app: single in-flight refresh (`refreshing ??=`) prevents refresh-token rotation races (`api.ts:97-119`); brand tokens are short-lived and held in memory only (`api.ts:147-163`); 401 handling re-mints once then signs out; idempotency keys per redeem/convert call.
- Customer app: OTP input uses `oneTimeCode` / `sms-otp` autofill with a hidden caret; phone is normalised to E.164 client-side and validated server-side.
- Customer app: `.expo/`, `dist/`, `credentials.json`, `.env*` all untracked; `apps/mobile` git-tracked non-source files are only `app.json`, `eas.json`, `babel.config.js`, `metro.config.js`, `package.json`, `tsconfig.json`, `.gitignore`.
- Customer app: app-status gate (`StatusGate.tsx`) supports forced minimum version and maintenance mode server-side, which gives an out-of-band kill switch for a compromised OTA/binary once MOBILE-04 is fixed.
