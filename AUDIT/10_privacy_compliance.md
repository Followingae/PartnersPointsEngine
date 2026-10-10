# 10 — Privacy & Compliance (UAE PDPL / GDPR / PCI DSS v4.0)

Audit date: 2026-10-10. Branch `main` @ afc3fe2 plus uncommitted working tree. Read-only inspection of the repository; no production access, no data pulled. Severity is on a compliance-impact scale (regulator action / stop-processing order / fine / reputational), with CVSS only where a technical exposure exists. Confidence: Confirmed (read the code), Likely (code plus reasonable inference), Needs verification (depends on runtime config or a third-party behaviour not visible in the repo).

Legal references are abbreviated: **PDPL** = UAE Federal Decree-Law 45/2021 on Personal Data Protection; **GDPR** = Regulation (EU) 2016/679; **PCI** = PCI DSS v4.0.1.

---

## 0. Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 2 | PRIV-01, PRIV-02 |
| High | 7 | PRIV-03, PRIV-04, PRIV-05, PRIV-06, PRIV-07, PRIV-08, PRIV-09 |
| Medium | 9 | PRIV-10 … PRIV-18 |
| Low | 5 | PRIV-19 … PRIV-23 |
| Info | 3 | PRIV-24 … PRIV-26 |

**PCI DSS scope verdict (one line):** the loyalty API is *not* a payment system and holds no full PAN by design, but it is **not cleanly out of scope**: it receives, stores and publishes an unvalidated `maskedPan` + `authNo` from the Feitian payment app, the terminal app logs the complete SmartPay response (card number, expiry, EMV AID/TVR/TSI/cryptogram) to logcat, and the public `card_token` identifier type invites PAN-derived values hashed with unsalted SHA-256. Treat as **SAQ-A-EP-like / "connected-to" system until PRIV-02, PRIV-06 and PRIV-14 are fixed**, after which it can be argued out of CDE scope (evidence in §6).

The three structural problems behind most findings:

1. **"Erasure" is not erasure.** The customer-facing deletion sweep (`2026-08-05_account_deletion.sql`) nulls five columns and leaves `phone_hash`, `email_hash`, `gender`, `home_branch_id`, every `customer_identifier` row, `receipt.member_name`, live refresh tokens, Apple pass registrations, audit rows and the free-text deletion reason. `phone_hash` is an unsalted SHA-256 of an E.164 number (10-digit search space) and is itself personal data. The brand-admin "GDPR erasure" endpoint archives a membership row and touches no PII at all.
2. **No consent, no purpose record, no retention.** No field anywhere records consent (terms acceptance, marketing, profiling, POS enrolment). Two privacy toggles in the app are local React state that is never sent to the server. No retention job exists for OTP rows, refresh tokens, outbox, webhook deliveries, idempotency responses, receipts or audit logs. `otp_prune()` exists in SQL and is never called.
3. **Docs describe controls that do not exist.** `docs/02-data-model.md`, `docs/04-feature-list.md` and `docs/security.md` describe per-record `pii_key_id` crypto-shredding, `is_pseudonymized`, consent endpoints, data-retention config and "the loyalty engine never receives card/PAN data". None of that is in the code.

---

## 1. PII inventory

Storage forms: **PT** = plaintext, **H** = unsalted SHA-256 hash, **ENC** = AES-256-GCM envelope with a single env-var master key (`apps/api/src/auth/crypto/envelope-crypto.service.ts:15-23`; falls back to a hard-coded dev key if the env var is missing), **ARGON** = argon2id. Tables marked RLS are in the tenant-isolation loop in `packages/db/prisma/sql/rls.sql:88-101`; `person` has its own policy (`rls.sql:243-262`).

| Table.column | Data | Form | Purpose | Who reads it (surface) | Exported / sent where | Retention | RLS |
|---|---|---|---|---|---|---|---|
| `person.phone_hash` | phone (E.164) | H | dedupe / OTP sign-in / POS lookup | OTP login (`auth.service.ts:146,259`), superadmin search (`superadmin.service.ts:478`) | — | **forever; survives deletion sweep** | own policy |
| `person.phone_enc` | phone | ENC | WhatsApp alerts, admin contact | brand admin 360 (`loyalty.service.ts:749`), superadmin list (`superadmin.service.ts:510`), txn alerts (`txn-alert.service.ts:100`), customer profile | Twilio (`sms-sender.service.ts`), **pino logs** (`sms-sender.service.ts:73,169,176,194,198`), brand JSON export | nulled on sweep | own policy |
| `person.email_hash` / `email_enc` | email | H / ENC | receipts, welcome mail | brand 360, superadmin detail, receipt email (`terminal.service.ts:446`) | Resend (US) | hash survives sweep | own policy |
| `person.full_name` | name | PT | segmentation, receipts, passes | brand 360, superadmin, terminal (`terminal_enroll_person`), receipt page, Apple/Google pass | public receipt URL (`receipt-public.controller.ts:98,399`), Apple/Google pass payload (`apple-wallet.service.ts:161`, `google-wallet.service.ts:100`), receipt email, terminal `txn_history.json` | nulled on sweep (but `receipt.member_name` copy survives) | own policy |
| `person.gender` | gender | PT | segments | brand 360, superadmin, segments SQL (`segment.service.ts:72`) | JSON export | **survives sweep** | own policy |
| `person.birthdate` | DOB | PT (date) | birthday campaigns, age segments (`segment.service.ts:73-76`) | brand 360, superadmin | JSON export | nulled on sweep | own policy |
| `person.nationality` | nationality (ISO-2) | PT, indexed (`2026-08-03_profile_and_alerts.sql:17`) | segments | brand 360, superadmin | JSON export | nulled on sweep | own policy |
| `person.home_branch_id` | habitual location | PT | geo-targeted offers | app only | — | **survives sweep** | own policy |
| `person.txn_alerts_opt_out` | messaging preference | PT bool, default false | opt-out of per-transaction WhatsApp | txn alerts via `txn_alert_recipient()` | — | — | own policy |
| `customer_identifier.value_hash` | phone / email / qr / nfc / loyalty_id / `card_token` | H | till lookup | terminal resolve (`terminal.service.ts:129`) | — | **forever; survives sweep** (row cascades only on person delete, which never happens) | RLS |
| `customer_membership.loyalty_id` | pseudonymous member id | PT | member id on passes, CSV, receipts | all | CSV exports, passes, receipts | forever | RLS |
| `user_account.email`, `full_name` | staff PII | PT | login | superadmin/brand team pages | audit_log data (`team.service.ts:74`, `superadmin.service.ts:86`) | forever | not in RLS loop |
| `user_account.password_hash` | credential | ARGON | login | — | temp password returned in API response (`team.service.ts:75`) | — | — |
| `user_account.totp_secret_enc` | MFA secret | ENC | MFA | — | — | — | — |
| `refresh_token.user_agent`, `ip` | device fingerprint | PT | session list (`wallet_sessions()`) | customer Security screen | — | **no cleanup; not revoked on deletion** | not in RLS loop |
| `receipt.*` | order no, amounts, `masked_pan`, `auth_no`, `member_name`, `balance_after`, view/click counters, `first/last_viewed_at` | PT | public e-receipt | **anyone with the token** (`/v1/r/:token`, no auth), superadmin ereceipts | HTML + PDF; receipt email | forever | deliberately **no RLS** (`schema.prisma:481-482`) |
| `terminal_transaction` | membership id, amount, points, branch, terminal | PT | ledger context | brand, superadmin, customer | webhooks (pseudonymous), CSV | forever | RLS |
| `audit_log.data` | staff emails (`team.invite`), reasons, field lists | PT JSON | audit | brand/superadmin audit pages | — | forever, UPDATE/DELETE blocked by trigger (`rls.sql:233-236`) | RLS |
| `otp_code.phone_hash`, `code_hash` | phone hash + sha256(6-digit code) | H / H | sign-in | — | — | `otp_prune()` defined (`2026-07-28_otp_code.sql`) but **never called** | own RLS, definer fns |
| `push_token.token` | Expo/APNs/FCM device token | PT | push | — | Expo push service (US) | deleted on sweep | not in loop |
| `pass_registration.device_library_id`, `push_token` | Apple device identifier + APNs token | PT | pass refresh | Apple PassKit web service (no guard; token checked in handler) | APNs | **survives sweep**; dropped only when Apple reports dead | not in loop |
| `account_deletion.reason` | customer free text | PT | deletion queue | nobody (no controller for `pending()`) | pino `warn` with person id (`deletion.service.ts:49`) | forever | not in loop |
| `outbox.payload`, `webhook_delivery.payload` | membershipId, points, amounts, challenge/reward names | PT JSON | webhooks | brand webhook page | merchant endpoints (HMAC-signed) | forever | RLS |
| `idempotency_key.response` | full API response JSON of mutating ops | PT JSON | replay | — | — | forever | RLS |
| `rfm_snapshot`, `brand_daily_metric` | per-membership RFM scores / aggregates | PT | reporting | brand | RFM CSV (loyalty id only) | forever | RLS |
| `partner_customer_link.partner_member_ref` | Lulu member reference (card/phone per `partner-connector.ts:10`) | PT | conversion | customer | partner connector (stub; would go to Lulu) | forever | **not in RLS loop** |
| `impersonation_session` | superadmin → brand act-as | PT | audit | — | — | forever; `reason` hard-coded (`superadmin.service.ts:120`) | not in loop |
| Terminal device `txn_history.json` | `memberName`, `memberPhone` (E.164), `maskedPan`, `authNo` | PT file in app `filesDir` (`HistoryStore.kt:24-25,72`) | cashier history / refunds | anyone with the device | — | capped list, never purged by age | n/a |
| Terminal `OfflineOutbox` | queued enrol (`phone`, `name`) and receipt payloads | PT JSON file | offline replay | device | replayed to API | until synced | n/a |
| Mobile `AsyncStorage` | wallet + refresh JWT (`apps/mobile/lib/api.ts:42-43`) | PT (no SecureStore) | session | device | — | until sign-out | n/a |

Crypto actually applied (grep of `crypto.encrypt(`): `person.phone_enc` (`terminal.service.ts:222`), `person.email_enc` (`wallet.service.ts:152`), `user_account.totp_secret_enc`, `api_key.secret_enc`, `webhook_endpoint.secret_enc`, `partner.connector_config_enc`. **Everything else listed as PT is plaintext**, which matches `docs/security.md:9` ("TOTP secrets + phone") but not `docs/02-data-model.md:878` (`full_name_enc`, `pii_key_id`).

---

## 2. Processor / transfer table (PDPL Arts. 22–23, GDPR Ch. V)

No data map, Record of Processing Activities, DPA register or transfer-impact assessment exists in the repo. `docs/06-open-questions.md:71` and `docs/deployment.md:33` acknowledge that "Supabase/DO have no UAE region" and assert "UAE PDPL permits cross-border transfer with safeguards" without naming a safeguard.

| Processor | Region (evidence) | Data received | Safeguard referenced in repo |
|---|---|---|---|
| DigitalOcean App Platform (API) | `fra` = Frankfurt (`.do/app.yaml:5`) | all PII in memory and in pino logs (phone numbers, OTP codes when no SMS provider) | none |
| Supabase (Postgres) | **unknown**; `DEPLOYMENT.md:28` has `aws-0-<region>` placeholder; docs say "nearest ≈ Mumbai/Frankfurt" | entire database | none |
| Vercel (two consoles + docs) | global edge | staff sessions; customer PII rendered client-side from API | none |
| Twilio (SMS / WhatsApp) | US company; message routing via Meta for WhatsApp | phone number, OTP code, first name, points, brand, receipt link (`txn-alert.service.ts:118-156`) | none; TDRA sender-ID registration only mentioned as a comment (`.do/app.yaml:39`) |
| Meta (WhatsApp Business) | US | same as Twilio WhatsApp path | none |
| Resend (email) | US | email, name, order, amounts, points, receipt link (`email.service.ts:43`) | none |
| Apple (PassKit / APNs) | US | loyalty id, short name, balance, device library id, push token | none |
| Google (Wallet) | US | loyalty id, short name, balance | none |
| Expo (EAS Update, push) | US | push tokens, app/device metadata | none |
| Lulu (partner connector) | UAE (stub only, `partner-connector.ts`) | partner member ref, points | none |
| Feitian SmartPay (payment app on the same device) | on-device | receives amount/order; **returns** card data to the loyalty app (see §6) | none |

---

## 3. Findings

### PRIV-01 — "Account deletion" leaves re-identifiable data and does not terminate access
- **Severity:** Critical · **Confidence:** Confirmed · **Effort:** M
- **Location:** `packages/db/prisma/sql/2026-08-05_account_deletion.sql:115-135` (`sweep_account_deletions`), `2026-07-28_customer_wallet.sql:182-199` (`wallet_person_by_phone`), `2026-07-28_wallet_join_brand.sql:36-41`, `2026-07-28_person_access_and_receipts.sql:51-58` (`terminal_enroll_person`)
- **Evidence:**
  ```sql
  UPDATE person SET full_name = NULL, phone_enc = NULL, email_enc = NULL,
         birthdate = NULL, nationality = NULL, status = 'archived' WHERE id = r.person_id;
  DELETE FROM push_token WHERE push_token.person_id = r.person_id;
  UPDATE customer_membership SET status = 'archived' WHERE ...
  ```
  Not touched: `person.phone_hash`, `person.email_hash`, `person.gender`, `person.home_branch_id`, every `customer_identifier` row (type `phone`, hash of the number), `refresh_token` rows (not revoked), `pass_registration` (device id + APNs token), `receipt.member_name`, `account_deletion.reason`, `partner_customer_link`, `audit_log`, `webhook_delivery`, `idempotency_key.response`.
  `phone_hash` is `sha256(E.164)` with no salt or pepper (`auth.service.ts:14`, `terminal.service.ts:14`). UAE mobile numbers are `+9715[0-9]{8}`: 10⁸ candidates, brute-forced in seconds. `wallet_person_by_phone()` does **not** filter on `person.status`, so a "deleted" person can still request an OTP, sign in, and `wallet_join_brand()` flips an archived membership back to `active` with the original ledger account (balance intact). `terminal_enroll_person()` re-uses the archived row by `phone_hash` and back-fills the name.
- **Impact:** The app tells the customer "Your profile and personal details will be permanently removed" (`apps/mobile/app/profile/privacy.tsx:39`). In fact the record remains linkable to the individual (hash of phone), the person can still authenticate, and a till re-enrolling the same number resurrects the identity. This is a misrepresentation to the data subject and a failure of the right to erasure (PDPL Art. 13(1)(b) & Art. 15; GDPR Art. 17). It also fails Apple Guideline 5.1.1(v) in substance.
- **Scenario:** Customer deletes account on day 0. Day 31 the sweep runs. Day 40 a cashier types the same number at a till: `terminal_enroll_person` returns the old `person.id`, sets `full_name` from what the cashier typed, the old loyalty id and points reappear. Alternatively the customer's still-valid refresh token in another device continues to work for 30 days.
- **Fix:** In the sweep: (a) set `phone_hash`/`email_hash` to a random tombstone or NULL (the unique index allows NULL); (b) delete `customer_identifier` rows for the person's memberships; (c) `UPDATE refresh_token SET revoked_at = now() WHERE person_id = …`; (d) delete `pass_registration` by serial = membership ids; (e) null `receipt.member_name` for the memberships; (f) null `gender`, `home_branch_id`, `account_deletion.reason`; (g) have `wallet_person_by_phone` and `terminal_enroll_person` refuse or create a fresh person for `status = 'archived'`. Write an audit row `customer.deletion.completed`. Document what the ledger keeps and why in the privacy notice.
- **Reference:** PDPL Art. 13(1)(b), Art. 15 (erasure), Art. 7(1)(c) (misleading notice); GDPR Art. 17, Recital 26 (hashed identifiers remain personal data).

### PRIV-02 — Terminal app logs the full SmartPay payment response (card number, expiry, EMV cryptogram) to logcat
- **Severity:** Critical (PCI) · **Confidence:** Confirmed for the logging; **Needs verification** whether `card_no` arrives masked · **Effort:** S
- **Location:** `apps/terminal-android/app/src/main/java/ae/rfmloyaltyco/terminal/ecr/SmartPayIntentBridge.kt:129-130,142-164`
- **Evidence:**
  ```kotlin
  val dump = data.extras?.keySet()?.joinToString { k -> "$k=${data.extras?.get(k)}" } ?: ""
  Log.i(TAG, "SmartPay result rc=$resultCode extras{$dump}")
  ...
  maskedPan = data.stringLike("card_no"),
  cardExpiry = data.stringLike("card_expire_date"),
  aid = data.stringLike("aid"), tvr = ..., tsi = ..., cid = ..., ac = data.stringLike("ac"),
  extras = data.allExtras(), raw = dump,
  ```
  Every extra the payment app returns is written at INFO level, and the parsed result carries `cardExpiry`, the EMV Application Cryptogram (`ac`), TVR/TSI/CID and a `raw` dump. `EcrTransport.kt:20-21` comments that these are "full acquirer slip data". Nothing in the repo masks `card_no` before it is logged or stored; the only evidence of masking is the demo transport's hard-coded `"•••• 4242"` (`DemoEcrTransport.kt:30`).
- **Impact:** If `card_no` is a full or partially-masked PAN, logcat on a shared retail device (readable by any app with `READ_LOGS` on older builds, by `adb`, and by crash-reporting tools) holds PAN + expiry + EMV cryptograms. PCI DSS 4.0 req. 3.3.1 prohibits retaining SAD after authorisation in any form; req. 3.4.1 requires PAN masking when displayed; req. 10.2/10.3 forbid CHD in logs. This single line pulls the loyalty APK into the CDE.
- **Scenario:** A field engineer runs `adb logcat` to debug an ECR link issue and captures a day's card numbers and cryptograms in a text file that is then emailed to support.
- **Fix:** Remove the extras dump. Parse only the fields needed (`order_no`, `errorCode`, masked PAN last-4, `auth_no`, `refer_no`). Drop `cardExpiry`, `aid/tvr/tsi/cid/ac`, `extras` and `raw` from `EcrPaymentResult` unless a merchant-copy slip is actually printed by this app (today `ReceiptRenderer.kt:26,177` explicitly excludes acquirer data, so they are unused). Enforce masking in code: `maskedPan = last4(card_no)` formatted as `**** 1234` regardless of what SmartPay returns. Confirm with Feitian's ECR spec §3.1 what `card_no` contains and keep the written answer as PCI evidence.
- **Reference:** PCI DSS 4.0.1 req. 3.3.1, 3.3.1.1–3.3.1.3, 3.4.1, 10.2.1; PDPL Art. 20 (security).

### PRIV-03 — Brand-admin "GDPR erasure" archives a membership and removes no personal data
- **Severity:** High · **Confidence:** Confirmed · **Effort:** M
- **Location:** `apps/api/src/modules/loyalty-rules/manage.controller.ts:301-306`, `loyalty.service.ts:556-564`
- **Evidence:**
  ```ts
  @ApiOperation({ summary: 'GDPR erasure — archive the membership.' })
  ...
  await tx.customerMembership.update({ where: { id: membershipId }, data: { status: 'archived' } });
  await this.audit.record(tx, ctx, { action: 'customer.erase', ... });
  return { membershipId, erased: true };
  ```
  `person.*` (name, phone, email, DOB, nationality), `customer_identifier`, `receipt.member_name` are untouched. `wallet_join_brand()` lets the customer un-archive it from the app (`2026-07-28_wallet_join_brand.sql:38-40`).
- **Impact:** A merchant that receives a data-subject erasure request and uses this endpoint will respond "erased: true" while retaining everything. Under PDPL the merchant is the controller for its programme and the platform is the processor; the processor is providing a tool that cannot fulfil Art. 15. Because `person` is shared across brands, a correct implementation must distinguish "remove me from brand X" from "delete me from the platform", which the current API cannot express.
- **Fix:** Rename the endpoint to what it does (`members/:id/archive`). Add a real erasure path for the brand scope: delete the brand's `customer_identifier` rows, null `receipt.member_name` for that brand's receipts, and if the person has no other active memberships trigger the platform-level deletion flow (after PRIV-01 is fixed). Record `customer.erasure.requested/completed` with who requested it. Expose the deletion queue (`deletion.service.ts:122 pending()` has no controller) so staff can see outstanding requests.
- **Reference:** PDPL Art. 15, Art. 8 (processor obligations); GDPR Art. 17, Art. 28(3)(e).

### PRIV-04 — No consent is captured anywhere: terms, marketing, profiling, or POS enrolment
- **Severity:** High · **Confidence:** Confirmed · **Effort:** M
- **Location:** `packages/db/prisma/schema.prisma` (no consent/terms fields on `Person`, `CustomerMembership`); `apps/mobile/app/onboarding/phone.tsx:98`; `apps/api/src/modules/terminal-gateway/dto.ts:35-37` (`EnrollDto` = `phone`, `fullName` only); `apps/terminal-android/.../ui/CustomerScreen.kt:113-124`
- **Evidence:**
  - App onboarding shows static text "By continuing you agree to our Terms and Privacy Policy." (`phone.tsx:98`). Nothing is posted; no version, timestamp or flag is stored.
  - POS enrolment: cashier types a phone and optional name; the DTO has no consent field; the screen has no notice text (`CustomerScreen.kt` strings: "New member", "Customer name (optional)").
  - `grep -ri consent apps packages` returns no data field. The only preference is `txn_alerts_opt_out` (default `false` = messages on).
  - `docs/03-api-surface.md:452` lists `GET /v1/customer/me/consents` — not implemented.
  - The authors flagged this: `docs/plan-2026-08-wallet-profile-claims-messaging.md:267-273` "There is no opt-out model in the schema … Recommend a per-customer messaging preference … before this goes live".
- **Impact:** The platform cannot demonstrate the lawful basis for any processing (PDPL Art. 4 requires consent unless an exception applies; Art. 6 requires consent to be demonstrable and withdrawable). Customers enrolled at a till by a cashier have never seen a notice (PDPL Art. 13 right to be informed). WhatsApp business-initiated messages default to on with no opt-in record (Meta Business Messaging Policy requires opt-in; TDRA SMS rules require opt-in for promotional content).
- **Fix:** Add `consent_event` table (person_id, kind: `terms|privacy|txn_alerts|marketing|profiling`, version, granted bool, source: `app|pos|import`, actor, ip/ua, at). Record terms/privacy version at OTP verify; record `txn_alerts` opt-in at first app sign-in; have `EnrollDto` carry `noticeShown: true` and print/show a short notice on the terminal enrol screen. Flip `txn_alerts` to opt-in for app-less POS-enrolled members, or send one transactional opt-in template first.
- **Reference:** PDPL Arts. 4, 6, 7, 13; GDPR Arts. 6, 7, 13; Meta WhatsApp Business Messaging Policy (opt-in); TDRA Regulatory Policy on Unsolicited Electronic Communications.

### PRIV-05 — Privacy toggles in the app are fake (local state only)
- **Severity:** High · **Confidence:** Confirmed · **Effort:** S (remove) / M (implement)
- **Location:** `apps/mobile/app/profile/privacy.tsx:19-20,76-88`
- **Evidence:**
  ```tsx
  const [personalised, setPersonalised] = useState(true);
  const [share, setShare] = useState(false);
  ...
  <ListRow title="Personalised offers" sub="Use my activity to tailor offers" onPress={() => setPersonalised((v) => !v)} ... />
  <ListRow title="Share data with merchants" sub="Let merchants see your tier" onPress={() => setShare((v) => !v)} ... />
  ```
  No API call, no persistence, reset on every screen open. Meanwhile the server segments on nationality/gender/age (`segment.service.ts`), merchants see full profile incl. phone/email/DOB (`loyalty.service.ts:746-756`) regardless of the "Share data with merchants" switch defaulting to off.
- **Impact:** A control that appears to let the data subject object to profiling and restrict sharing but does nothing is a deceptive design; under PDPL Art. 7 information must be accurate, and Art. 17 (objection to processing for marketing/profiling) is unenforceable. This also contradicts the App Store privacy declaration if it claims user controls.
- **Fix:** Either remove both rows until implemented, or wire them to `person.profiling_opt_out` / `person.share_profile_with_merchants` and honour them in `segment.service.ts` (exclude opted-out members) and `customerProfile` (mask contact when sharing is off).
- **Reference:** PDPL Art. 7(1)(c), Art. 17; GDPR Art. 21(2), Art. 5(1)(a) (fairness).

### PRIV-06 — API accepts, stores and publicly serves an unvalidated `maskedPan` and `authNo`
- **Severity:** High (PCI) · **Confidence:** Confirmed · **Effort:** S
- **Location:** `apps/api/src/modules/terminal-gateway/dto.ts:64-65`, `terminal.service.ts:383-384`, `receipt-public.controller.ts:89-90,353` (`/v1/r/:token`, no auth), `schema.prisma:500-501`
- **Evidence:**
  ```ts
  @ApiProperty({ required: false }) @IsOptional() @IsString() maskedPan?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() authNo?: string;
  ...
  line('Payment', r.paymentMethod === 'cash' ? 'Cash' : ['Card', r.maskedPan].filter(Boolean).join(' '));
  ```
  The field is a free string. The terminal sends whatever SmartPay returned in `card_no` (`CheckoutViewModel.kt:433`). `docs/security.md:10` states "the loyalty engine never receives card/PAN data"; `docs/06-open-questions.md:111` repeats it. The e-receipt page is unauthenticated, indexed by a UUID token, and rendered for anyone who opens the printed QR.
- **Impact:** If any terminal (first-party bug, firmware change, or a third-party POS using the public `POST /v1/terminal/receipts`) sends an unmasked PAN, the API stores it in `receipt.masked_pan` in plaintext and serves it on a public web page and in a PDF. Even with a correctly masked value, storing the first-6/last-4 together with `auth_no` and amount is cardholder data for PCI purposes (truncation must leave at most BIN + last 4, req. 3.4.1 note).
- **Fix:** Validate server-side: accept only `^[*•xX ]{0,12}[0-9]{4}$`-style last-4 strings (reject and log anything with more than 4 consecutive digits); store only `cardLast4`. Drop `authNo` from the receipt or treat it as acquirer data that belongs on the SmartPay slip (as `ReceiptRenderer.kt:177` already says). Add a PCI-scoping memo to `docs/security.md` with the evidence from §6.
- **Reference:** PCI DSS 4.0.1 req. 3.4.1, 3.5.1, 6.2.4 (input validation), 12.5.2 (scope documentation).

### PRIV-07 — Phone numbers and one-time codes are written to application logs
- **Severity:** High · **Confidence:** Confirmed · **Effort:** S
- **Location:** `apps/api/src/auth/otp/sms-sender.service.ts:72-76,99,169,176,194,198`; `apps/api/src/app.module.ts:58` (redact list)
- **Evidence:**
  ```ts
  this.logger.warn(`[OTP NOT SENT — no SMS provider configured] ${phone} -> ${code}. ...`);
  this.logger.warn(`[TEMPLATE NOT SENT — no Twilio provider] ${contentSid} -> ${phone}`);
  this.logger.error(`Twilio rejected the send to ${phone}: ${res.status} ${reason}`);
  ```
  Pino redaction covers only three request headers. Logs go to DigitalOcean (Frankfurt) with whatever retention DO applies. `.do/app.yaml:33` documents the behaviour ("Without these the API stores a code and logs it"). Also: `envelope-crypto.service.ts:19` logs a warning and silently uses a hard-coded dev key if `PII_MASTER_KEY_BASE64` is unset, so a mis-deployed instance would "encrypt" PII with a public key without failing.
- **Impact:** Phone numbers in logs are personal data stored outside the controlled database with no retention, visible to anyone with DO console access, and transferred cross-border. Logged OTP codes are live credentials. Twilio error paths will log phones in production on every delivery failure.
- **Fix:** Log a hash prefix or last-2 digits only. Never log the code; in `none` mode throw at boot in production. Add `phone`, `code`, `email`, `fullName` to pino `redact` paths for any structured context. Make the dev-key fallback a hard failure when `NODE_ENV=production`.
- **Reference:** PDPL Art. 20 (security), Art. 5 (minimisation); GDPR Art. 32; PCI 4.0 req. 8.3.2 (credentials unreadable) by analogy.

### PRIV-08 — Platform-wide customer directory with decrypted phone numbers is readable by the `analyst_readonly` role, unaudited
- **Severity:** High · **Confidence:** Confirmed · **Effort:** S
- **Location:** `apps/api/src/modules/superadmin/superadmin.controller.ts:179-192` (`GET /v1/admin/customers`, `/customers/:personId` behind `platform.report.read`), `superadmin.service.ts:457-516,523-535,711-718`, `apps/api/src/auth/authz/authz.service.ts:25`
- **Evidence:**
  ```ts
  analyst_readonly: ['brand.report.read', 'platform.report.read'],
  ...
  phone: this.revealPhone(p.phoneEnc),   // every person on the platform, searchable by name/phone/loyalty id
  ```
  `customerDetail` returns name, phone, email, gender, birthdate, nationality and every brand membership across the platform. No `audit.record` call on either read; `listAuditLogs`/`auditLogs` therefore cannot answer "who looked at customer X".
- **Impact:** A read-only analyst invited by one merchant can enumerate every customer of every other merchant with phone numbers (cross-controller disclosure). Brand `customerProfile` and `exportCustomer` (`loyalty.service.ts:550,631`) are likewise unaudited reads of decrypted PII. Breach-investigation and PDPL Art. 9 breach-notification duties require knowing who accessed what.
- **Fix:** Remove `platform.report.read` from `analyst_readonly` (authz domain overlaps). Put the customer directory behind a dedicated `platform.customer.read` permission. Record `customer.pii.view` and `customer.export` audit rows with actor and target on every decrypting read; rate-limit the search.
- **Reference:** PDPL Art. 20, Art. 9; GDPR Art. 32, Art. 33; PCI 4.0 req. 7.2 (least privilege) by analogy.

### PRIV-09 — No data retention: OTP, sessions, outbox, deliveries, idempotency responses, receipts and logs are kept forever
- **Severity:** High · **Confidence:** Confirmed · **Effort:** M
- **Location:** `apps/api/src/modules/workers/worker-runner.service.ts:52-66` (the only scheduled jobs), `packages/db/prisma/sql/2026-07-28_otp_code.sql:95-99` (`otp_prune()` defined, no caller), `packages/db/src/ledger/engine.ts:307-311` (`idempotency_key.response` stores full responses)
- **Evidence:** `grep -rn "otp_prune|deleteMany|prune|retention|purge" apps/api/src` finds no retention job. `refresh_token` rows are revoked but never deleted (`auth.service.ts:214`). `receipt` rows (name, masked PAN, auth number, balance) have no TTL and the public link never expires. `docs/01-architecture.md:737-738` promised outbox pruning and partitioned audit logs.
- **Impact:** Storage-limitation principle (PDPL Art. 5(1)(e) equivalent: data kept no longer than necessary; GDPR Art. 5(1)(e)). Receipts with card last-4 + auth code retained indefinitely also expand PCI data-retention obligations (req. 3.2.1 requires a defined retention period and quarterly purge).
- **Fix:** Add an hourly `housekeeping` job: `otp_prune()`; delete `refresh_token` where `revoked_at < now()-7d` or `expires_at < now()`; delete `webhook_delivery` delivered/dead > 90 d; delete `outbox` published > 30 d; null `idempotency_key.response` > 7 d; null `receipt.masked_pan/auth_no/member_name` after 13 months and consider expiring the public token. Write the schedule into a retention policy document.
- **Reference:** PDPL Art. 5(1)(e); GDPR Art. 5(1)(e), Art. 25; PCI DSS 4.0.1 req. 3.2.1.

### PRIV-10 — Demographic profiling (nationality, gender, age) with no lawful-basis record, no notice and no objection route
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M
- **Location:** `apps/api/src/modules/segments/segment.service.ts:11,29-34,71-76,175-183`; `2026-08-03_profile_and_alerts.sql:17` (index on nationality "Segments will filter on nationality")
- **Evidence:** segment rules support `nationality`, `gender`, `ageYears`, `birthMonth` with `in/not_in/compare` operators; segments drive campaigns and offers. Prompts (`apps/mobile/app/prompts/nationality.tsx`, `birthday.tsx`) ask for the data as a "profile checklist" without stating that merchants will target on it; the brand console hint says "Used for birthday rewards and age segments" (`customers/[membershipId]/page.tsx:306`) but the customer never sees that.
- **Impact:** Nationality-based offer targeting is profiling and, in many readings, nationality is treated as sensitive. PDPL requires the purpose to be stated at collection (Art. 13) and gives a right to object to profiling/marketing (Art. 17). The fake toggle in PRIV-05 makes this worse.
- **Fix:** State the purpose on each prompt ("Merchants may use this to tailor offers"); store a profiling consent; add a brand-level switch so a merchant must affirmatively enable demographic segments; exclude opted-out persons in the segment SQL; log segment definitions that use demographics in the audit trail (already `segment.create/update`, but `data` only lists field names).
- **Reference:** PDPL Art. 13(1)(a), Art. 17, Art. 18 (automated processing); GDPR Art. 21, Art. 22, Recital 71.

### PRIV-11 — Birthdate collected with no age gate; no children's-data handling
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S
- **Location:** `apps/mobile/app/prompts/birthday.tsx:26,73`, `apps/mobile/app/onboarding/profiling.tsx:19-22`, `apps/api/src/modules/customer-wallet/dto.ts:19-20`, `loyalty.service.ts:846`
- **Evidence:** year picker offers the last 111 years with the current year first; the only validation is "not in the future". Server DTO is `@IsISO8601()` only; brand-admin edit has no validation at all. A birthdate in 2024 is accepted and the person is then segmented by `ageYears`.
- **Impact:** The platform can knowingly hold and profile a child's data (anyone can enrol a phone at a till). PDPL Art. 4 and GDPR Art. 8 require parental consent for children (PDPL defers to sector law; UAE Child Rights Law applies under 18). At minimum, a birthdate indicating a minor must stop marketing/profiling.
- **Fix:** Reject or flag birthdates implying age < 18 (configurable); suppress demographic segmentation and WhatsApp marketing for flagged persons; state a minimum age in the terms and in the enrol screen.
- **Reference:** PDPL Art. 4; GDPR Art. 8; Apple 1.3 / Google Play Families policies.

### PRIV-12 — Brand admins can edit shared, cross-brand identity attributes of a person
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S
- **Location:** `loyalty.service.ts:837-855` (`updateCustomerProfile` writes `person.full_name/gender/birthdate`), `2026-07-28_person_access_and_receipts.sql:53-57` (terminal back-fills name)
- **Evidence:** `person` is platform-scoped ("one phone = one person across brands", `schema.prisma:584`). Any brand with `brand.manage` overwrites the name/gender/DOB that every other brand and the customer see. Audit row records only `fields: [...]`, not before/after.
- **Impact:** Integrity and accuracy (PDPL Art. 5(1)(d)); one controller altering another controller's view of the subject. Rectification requests cannot be traced to a value.
- **Fix:** Make brand edits membership-scoped overrides (or read-only once the customer has set the field in the app); record before/after values in audit `data`.
- **Reference:** PDPL Art. 5(1)(d), Art. 14; GDPR Art. 5(1)(d), Art. 16.

### PRIV-13 — Data-subject export is incomplete and not portable
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S
- **Location:** `loyalty.service.ts:550-553`; `manage.controller.ts:294-299` (`brand.customer.read`); customer wallet has no export endpoint (`wallet.controller.ts:28-155`)
- **Evidence:** export = the brand's 360 payload (`customerProfile`) with an `exportedAt` stamp: contact fields, balance, last transactions (`take` limited), rewards. Missing: all other brands' memberships, `customer_identifier` list, consent history (none exists), push tokens, sessions, pass registrations, receipts, RFM scores/segments the person is in, referral data, partner links. Branch managers (`brand.customer.read`) can trigger it. The customer cannot self-serve.
- **Impact:** PDPL Art. 13 (right of access, including "the purposes… recipients… retention… automated decision logic") and Art. 14 (portability in a machine-readable format) are only partly met and only via the merchant.
- **Fix:** Add `GET /customer/wallet/export` producing a documented JSON schema covering every table in §1 keyed by the person; include segments/RFM membership and processors list; audit the call.
- **Reference:** PDPL Arts. 13, 14; GDPR Arts. 15, 20.

### PRIV-14 — `card_token` identifier type invites PAN-derived values and hashes them with unsalted SHA-256
- **Severity:** Medium (PCI scope) · **Confidence:** Likely · **Effort:** S
- **Location:** `apps/api/src/modules/terminal-gateway/dto.ts:5`, `terminal.service.ts:126-129` (`valueHash: sha256(value)`), `apps/docs/content/guides/identify-customers.md:18,73` ("Customer taps a card or phone → `nfc` or `card_token`"), `packages/sdk-terminal/src/index.ts:16`
- **Evidence:** The first-party terminal never sends `card_token` (only `qr` and `phone`, `CustomerScreen.kt:62`, `CheckoutViewModel.kt:165,186`). The public developer portal, however, tells third-party POS integrators to use `card_token` when "customer taps a card". Nothing defines what the token must be; a naïve integrator will send the PAN or a PAN hash. The API stores `sha256(value)` with no key.
- **Impact:** PCI DSS 4.0 req. 3.5.1.1: hashed PAN must use a keyed cryptographic hash with key management; an unkeyed SHA-256 of a PAN is still cardholder data (BIN + Luhn make brute force feasible). If any integrator does this, `customer_identifier` becomes a CHD store.
- **Fix:** Define `card_token` in the docs as "an acquirer-issued payment token, never the PAN or a PAN hash", or remove the type until an acquirer tokenisation integration exists. Add server-side rejection of 13–19-digit Luhn-valid values for every identifier type. Use HMAC-SHA-256 with a server pepper for all identifier hashes (also mitigates PRIV-01 re-identification).
- **Reference:** PCI DSS 4.0.1 req. 3.5.1, 3.5.1.1; PDPL Art. 20.

### PRIV-15 — Audit log: no verifier, no export, privileged actions missing, PII in rows, unlinked chain across instances
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M
- **Location:** `apps/api/src/platform-core/audit/audit.service.ts:26-48`; `superadmin.service.ts:1206-1214` (`topUpWallet`); `superadmin.service.ts:86`, `team.service.ts:74` (email in `data`)
- **Evidence:**
  - `grep -rn prevHash apps packages` finds only the writer; there is no chain verification routine, no scheduled integrity check, and no signed export for a regulator.
  - `prev` is `findFirst({ orderBy: createdAt desc })` under RLS, so the chain is per-visible-scope and two API instances writing concurrently can both link to the same predecessor (fork, not a chain).
  - Hash input uses `ctx.actor.id` but the stored `actorId` is `onBehalfOf ?? actor.id`, so a verifier would need the impersonator id that is not stored on the row.
  - Privileged endpoints with **no audit row**: group wallet top-up (`POST /admin/groups/:id/wallet/topup`), customer export (`GET /manage/customers/:id/export`), customer PII reads (brand and superadmin), platform customer search, account-deletion request/cancel/complete, admin login/MFA enrol/logout, refresh-token revoke, `PATCH /customer/wallet/profile`, terminal `members/enroll`.
  - `AuditEntry.data` is documented "never PII" (`audit.service.ts:11`) but `team.invite`/`platform_team.invite` store the invitee's email; audit rows cannot be deleted (trigger), so staff emails are retained forever.
- **Impact:** The log cannot demonstrate integrity to an auditor, misses the money and PII-access events most relevant to a breach review, and itself holds non-erasable PII.
- **Fix:** Use an advisory lock or sequence per scope when writing; store `impersonatorId` on the row; add `verifyChain(scope)` plus a daily job and a signed JSON/CSV export; audit the listed endpoints; replace emails in `data` with `userId`.
- **Reference:** PDPL Art. 7(2) (accountability), Art. 9 (breach records); GDPR Art. 5(2), Art. 30, Art. 33(5); PCI DSS 4.0.1 req. 10.2, 10.3.2, 10.5.1.

### PRIV-16 — Cross-border processing with no transfer safeguards, no RoPA, unknown DB region
- **Severity:** Medium · **Confidence:** Confirmed (absence) / Needs verification (actual Supabase region) · **Effort:** M (documentation) 
- **Location:** `.do/app.yaml:5` (`region: fra`), `DEPLOYMENT.md:28` (`aws-0-<region>`), `docs/06-open-questions.md:71`, `docs/deployment.md:33`
- **Evidence:** See §2. Every processor is outside the UAE; the docs state this is "acceptable" because "PDPL permits cross-border transfer with safeguards" but no DPA, SCC-equivalent, adequacy assessment, or Data Office notification is referenced. `platform.region` / `group.homeRegion` exist as columns but route nothing.
- **Impact:** PDPL Art. 22 permits transfer to jurisdictions with adequate protection (the EU is a plausible candidate for the DO/Supabase hosts if in Frankfurt); Art. 23 otherwise requires contractual safeguards or explicit consent. Without a documented basis the controller (merchant) cannot answer a Data Office inquiry, and the processor contract (Art. 8) is missing. Twilio/Resend/Expo/Apple/Google are US.
- **Fix:** Confirm and record the Supabase region. Produce a data map + RoPA (this report's §1–2 is a starting point). Execute DPAs with each processor (all offer standard DPAs). Add the transfer disclosure to the privacy policy. Document which PDPL Art. 22/23 basis applies per processor.
- **Reference:** PDPL Arts. 8, 22, 23; GDPR Arts. 28, 44–46.

### PRIV-17 — Terminal stores member phone numbers, names, masked PAN and auth numbers in a plaintext file on a shared device
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S
- **Location:** `apps/terminal-android/.../data/HistoryStore.kt:19-25,40-41,72,105`; `CheckoutViewModel.kt:561`
- **Evidence:** `TxnRecord(memberName, memberPhone, maskedPan, authNo, …)` serialised to `filesDir/txn_history.json`; `memberPhone` is the raw E.164 the cashier typed. `OfflineOutbox` similarly queues `phone`/`name` for enrolments. No encryption (EncryptedFile / Keystore) and no age-based purge; the cap is a count (`MAX`).
- **Impact:** A shared till is handled by many staff; Android backup, device loss, or `adb backup` on a debuggable build exposes customer phone numbers paired with card last-4 and auth codes.
- **Fix:** Drop `memberPhone` from history (keep loyalty id); encrypt the file with `EncryptedFile` (Jetpack Security) or the Android Keystore; purge records older than N days; set `android:allowBackup="false"` (verify in manifest).
- **Reference:** PDPL Art. 20; GDPR Art. 32; PCI DSS 4.0.1 req. 3.5.1 (if PAN data were ever unmasked).

### PRIV-18 — Documentation materially overstates implemented privacy controls
- **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S
- **Location:** `docs/02-data-model.md:878,961`; `docs/04-feature-list.md:204-205,321`; `docs/security.md:9-10`; `docs/03-api-surface.md:182-184,372,452`; `docs/01-architecture.md:551`
- **Evidence:** Claims vs code:
  | Claim | Code |
  |---|---|
  | `person.pii_key_id`, per-record data keys, `is_pseudonymized` tombstone | single env master key, no key id, no flag |
  | `full_name_enc` encrypted | `full_name` plaintext |
  | "Erasure = crypto-shred the subject key" | sweep nulls columns; hash kept (PRIV-01) |
  | `GET/PUT /v1/admin/config/data-retention` | not implemented, no retention |
  | `GET /v1/customer/me/consents` | not implemented |
  | "QR/NFC codes are rotating/signed" | QR = `sha256(loyalty_id)`, static (`wallet_join_brand.sql:53-55`) |
  | "The engine never touches PAN / never receives card data" | receives `maskedPan`, `authNo` (PRIV-06) |
  | `audit_log.before/after` encrypted blobs | `data` plaintext JSON |
- **Impact:** These documents will be handed to merchants, Lulu, Apple/Google reviewers and auditors as the control description. Misstatement in a vendor security questionnaire is a contractual and reputational risk in itself.
- **Fix:** Rewrite `docs/security.md` to describe only what exists, with a dated "planned" section; strike the unimplemented endpoints from `03-api-surface.md` or mark them.
- **Reference:** PDPL Art. 7(2) (accountability); general contract/representation risk.

### PRIV-19 — Public e-receipt page exposes name, balance, card last-4 and auth code with a never-expiring link and view tracking
- **Severity:** Low · **Confidence:** Confirmed · **Effort:** S
- **Location:** `receipt-public.controller.ts:21-44,89-98,353,397-401`; `CheckoutViewModel.kt:421` (token = `UUID.randomUUID()`)
- **Evidence:** 122-bit random token (adequate), global throttle applies, but the page is not `noindex`, is counted (`viewCount`, `firstViewedAt`, `lastViewedAt`, `adClicks`) and shows `memberName`, points balance, `maskedPan`, `authNo`. A receipt photographed or forwarded discloses the loyalty balance and name indefinitely.
- **Fix:** Add `X-Robots-Tag: noindex`, `Cache-Control: no-store`; expire or de-identify receipts after 13 months; drop `authNo` and balance from the public view (keep on the printed/emailed copy).
- **Reference:** PDPL Art. 5 (minimisation), Art. 20.

### PRIV-20 — Unsalted hashes for phone, email, identifiers and OTP codes
- **Severity:** Low (privacy) / see PRIV-01 for the erasure consequence · **Confidence:** Confirmed · **Effort:** M (migration)
- **Location:** `auth.service.ts:14`, `terminal.service.ts:14`, `otp-store.service.ts:6,46,60`, `wallet.service.ts` (email hash), `2026-07-28_wallet_join_brand.sql:55`
- **Evidence:** `sha256(E.164)`, `sha256(email)`, `sha256(code)` (6 digits → 10⁶ space). A database leak yields every phone number by dictionary.
- **Fix:** HMAC-SHA-256 with a server-side pepper (rotatable via `pepper_version` column); OTP codes hashed with the pepper and phone as associated data.
- **Reference:** PDPL Art. 20; GDPR Art. 32, Recital 26; PCI 4.0 req. 3.5.1.1 by analogy.

### PRIV-21 — Session and device data: IP/UA stored without notice; sessions survive deletion; mobile tokens in AsyncStorage
- **Severity:** Low · **Confidence:** Confirmed · **Effort:** S
- **Location:** `auth/device.ts:19-27`, `auth.service.ts:336-359`, `2026-08-03_wallet_sessions.sql`, `apps/mobile/lib/api.ts:42-43`, `apps/mobile/package.json` (no `expo-secure-store`)
- **Evidence:** IP and user-agent stored per refresh (fine for the Security screen) but not mentioned anywhere to the user; not removed by the deletion sweep (PRIV-01). Long-lived (30-day) refresh tokens sit in unencrypted AsyncStorage.
- **Fix:** Mention device data in the privacy notice; revoke on deletion; move tokens to SecureStore (mobile domain overlap).
- **Reference:** PDPL Art. 13, Art. 20.

### PRIV-22 — Twilio/WhatsApp compliance gaps: no sender-ID registration evidence, no opt-out footer, no STOP handling
- **Severity:** Low (until go-live) · **Confidence:** Confirmed (absence) · **Effort:** S
- **Location:** `.do/app.yaml:39-43`, `txn-alert.service.ts:24-31`, `sms-sender.service.ts:60-80`
- **Evidence:** SMS `From` may be "a UAE-registered sender ID" but nothing in the repo records TDRA registration; no inbound webhook handles `STOP`/`UNSUBSCRIBE`; template bodies are not in the repo (only Twilio Content SIDs), so the opt-out line Meta requires for marketing-category templates cannot be verified; `txn_alerts_opt_out` default is `false` so every POS-enrolled member who never installs the app receives WhatsApp messages with no way to opt out except by installing the app.
- **Fix:** Register the sender ID and store the TDRA reference in `docs/`; keep template texts in the repo; add a Twilio inbound webhook that sets `txn_alerts_opt_out` on STOP; categorise the templates as "utility" with Meta and keep the receipt link only.
- **Reference:** TDRA Unsolicited Electronic Communications policy; Meta Business Messaging Policy; PDPL Art. 17.

### PRIV-23 — Lulu partner link stores the partner member reference (card/phone) in plaintext outside RLS
- **Severity:** Low · **Confidence:** Confirmed · **Effort:** S
- **Location:** `schema.prisma:1448-1459`, `conversion.service.ts:36-43`, `partner-connector.ts:10-11`
- **Evidence:** `partner_member_ref` is "card / phone" per the connector comment; stored plaintext; table not in the RLS loop (`rls.sql:88-101`); not cleared by the deletion sweep.
- **Fix:** Envelope-encrypt the ref; add to the RLS list (person-scoped via definer function); clear on deletion.
- **Reference:** PDPL Art. 20.

### PRIV-24 — Staff invitation returns a temporary password in the API response (Info)
- **Location:** `team.service.ts:10,59-75`. Delivered out of band by the inviter; not logged by the API. Fine for now; note for the staff-data section of the privacy notice. 

### PRIV-25 — Customer leaderboard exposes `membershipId` of other customers (Info)
- **Location:** `gamification.service.ts` leaderboard query returns `{ rank, membershipId, lifetime }` to any customer of the brand. Pseudonymous, but an internal key; prefer a display handle.

### PRIV-26 — Impersonation sessions record a hard-coded reason and never end (Info)
- **Location:** `superadmin.service.ts:120` (`reason: 'superadmin brand management'`), `ImpersonationSession.endedAt` never set. Weakens the accountability story for "act-as".

---

## 4. Data-subject rights matrix

| Right (PDPL) | Customer self-service | Via merchant | Gap |
|---|---|---|---|
| Access / copy (Art. 13) | `GET /customer/wallet/profile` (profile only) | `GET /manage/customers/:id/export` (brand slice) | no full export; see PRIV-13 |
| Rectification (Art. 14) | `PATCH /customer/wallet/profile`, `/email`, `/home-branch` | `PATCH /manage/customers/:id/profile` | brand overwrites shared fields (PRIV-12) |
| Erasure (Art. 15) | `POST /customer/wallet/deletion` 30-day | `DELETE /manage/customers/:id` | both incomplete (PRIV-01, PRIV-03) |
| Restriction / objection to marketing & profiling (Art. 16-17) | `txnAlertsOptOut` only | none | fake toggles (PRIV-05), no profiling opt-out (PRIV-10) |
| Portability (Art. 14) | none | JSON export | not machine-readable spec (PRIV-13) |
| Automated decisions (Art. 18) | none | segments/tiers are automated | no notice or human review path |
| Withdraw consent (Art. 6) | n/a | n/a | no consent exists (PRIV-04) |

---

## 5. Audit-logging coverage (for regulator review)

Writer: `AuditService.record` only (`audit.service.ts`), 83 call sites. Append-only trigger present (`rls.sql:233-236`). Tenant-scoped RLS present. Hash chain written, never verified, not exportable.

| Privileged action | Endpoint | Audited? |
|---|---|---|
| Group wallet top-up | `POST /admin/groups/:id/wallet/topup` | **No** (ledger journal only) |
| Cost rule set | `POST /admin/groups/:id/cost-rule` | Yes `cost_rule.set` |
| Voucher issue / cancel | `POST /admin/vouchers`, `/:id/cancel` | Yes |
| Act-as | `POST /admin/brands/:id/act-as` | Yes `brand.act_as` (+ impersonation row) |
| Team invite / role / revoke (platform and brand) | various | Yes (but email in `data`) |
| Terminal key issue / revoke | `POST /admin/terminals/:id/keys[/revoke]` | Yes |
| Terminal release publish | `POST /admin/terminal-releases/:id/publish` | Yes |
| Brand settings / modules / governance | various | Yes |
| Customer data export | `GET /manage/customers/:id/export` | **No** |
| Customer PII view (brand 360, superadmin list/detail/search) | `GET /manage/customers/:id`, `GET /admin/customers*`, `/admin/search` | **No** |
| Customer erase (brand) | `DELETE /manage/customers/:id` | Yes `customer.erase` (misleading) |
| Account deletion request / cancel / completion | `/customer/wallet/deletion` + sweep | **No** (pino only) |
| Customer profile PATCH (app) | `PATCH /customer/wallet/profile` | **No** |
| POS enrolment (new person created) | `POST /terminal/members/enroll` | **No** |
| Admin login, MFA enrol/confirm, logout, refresh revoke | `/auth/*` | **No** |
| Webhook endpoint CRUD / rotate | `/manage/webhooks*` | Yes |

---

## 6. PCI DSS scope evidence

| Check | Evidence | Result |
|---|---|---|
| Full PAN received by API | `dto.ts:64` `maskedPan` free string; no validation | **Possible**; depends on SmartPay masking (`card_no`) |
| PAN stored by API | `receipt.masked_pan` plaintext | stores whatever is sent |
| PAN displayed | public receipt HTML/PDF `receipt-public.controller.ts:89,353` | yes (masked if sent masked) |
| Expiry / SAD | not sent to API; **captured and logged on terminal** `SmartPayIntentBridge.kt:130,153-163` (`card_expire_date`, `aid`, `tvr`, `tsi`, `cid`, `ac`) | **SAD-adjacent data in device logs** |
| Track / CVV | no `track`, `cvv`, `cvc` tokens anywhere in `apps/`, `packages/` | not handled |
| 13–19-digit regex in API logs | no explicit logging of card fields in `apps/api`; pino logs request url + headers only (bodies not logged by default) | clear |
| Loyalty printed slip | `ReceiptRenderer.kt:26,177` excludes acquirer data | clear |
| Terminal local storage | `HistoryStore.kt` stores `maskedPan`, `authNo` in plaintext JSON | masked-only if SmartPay masks |
| `card_token` identifier | accepted, unsalted SHA-256, documented for "card tap" | **scope risk** (PRIV-14) |
| Payment app integration | SmartPay via Android Intent / Feitian ECR SDK; card read and auth happen in SmartPay (separate PCI-scoped stack per `docs/06-open-questions.md:111`) | loyalty app is a "connected-to" system on the same device |

**Verdict:** No full PAN or SAD is handled by the API *by design*, but the controls that would prove it are absent (no input validation, no masking enforcement, no logging hygiene on the device). Until PRIV-02, PRIV-06 and PRIV-14 are closed and documented, a QSA would treat the terminal app as in scope (it runs on the payment device and logs CHD) and the API as a connected system holding truncated CHD. After remediation the API can be documented as out of CDE scope holding only last-4 (not CHD under the truncation rule) and the terminal app as a connected-to system with compensating controls.

---

## 7. Not assessed
- Runtime configuration of Supabase (region, backups, PITR, log retention) and DigitalOcean log drains: no production access.
- What the Feitian SmartPay app actually returns in `card_no` (masked vs full): requires the ECR spec or a device capture.
- Twilio template bodies, Meta template categories, TDRA sender-ID registration status: not in repo.
- Actual contents of `https://partnerspoints.ae/privacy` and `/terms` (linked from `about.tsx:15-16`): external.
- App Store / Play "privacy nutrition" declarations: `docs/store-submission.md` has none.
- Vercel console cookie/analytics: no trackers found in `apps/web-*` or `apps/docs` source; third-party scripts loaded at runtime were not checked.
- Backup and log retention at processors.
- Cross-tenant authorisation correctness in general (domain 02) and SSRF on webhook URLs (domain 03); only the privacy consequence of the `analyst_readonly` permission is noted here.

## 8. Positive controls verified
- Phone and email ciphertext at rest with AES-256-GCM and a random 96-bit IV per record (`envelope-crypto.service.ts:26-35`); TOTP secrets, HMAC secrets, webhook secrets and partner connector config likewise.
- OTP codes are never stored in clear (`otp_code.code_hash`), single-use, attempt-limited (`otp_verify`), rate-limited per window (`otp_issue`).
- Transaction-alert opt-out is enforced at the SQL source (`txn_alert_recipient()` returns nothing when opted out) rather than trusted to each caller (`2026-08-03_profile_and_alerts.sql:83-100`).
- Webhook payloads and all CSV exports are pseudonymous (membership/loyalty id, points, amounts) — no name, phone or email leaves via those channels (`webhook.service.ts:176`, `analytics.service.ts:267-298`, `reporting.service.ts:223-235`).
- CSV writer escapes formula-injection characters and quotes per RFC 4180 (`platform-core/csv.ts:28-33`).
- The printed loyalty slip deliberately carries no acquirer/card data (`ReceiptRenderer.kt:26,177`).
- Public receipt tokens are 122-bit UUIDv4 generated on the terminal (`CheckoutViewModel.kt:421`); the page sets a CSP (`receipt-public.controller.ts:27`) and is under the global IP throttle.
- Audit table is append-only at the database level (`rls.sql:233-236`) and hash-chained; writes are inside the same transaction as the mutation.
- Account deletion is customer-initiated and completes without staff action, with an in-app cancel path (`deletion.service.ts`, `privacy.tsx`), meeting the Apple/Google mechanics even though the data outcome is deficient.
- `person` has an RLS policy restricting brand/group contexts to persons with a membership in scope (`rls.sql:243-262`).
- No third-party analytics, advertising or crash-reporting SDKs in the mobile app or consoles (`apps/mobile/package.json`, grep of `apps/web-*`); iOS `ITSAppUsesNonExemptEncryption=false` and purpose strings for camera and Face ID are present (`app.json:20,37,44`); no location permission requested.
- Pino redacts `authorization`, `cookie` and `x-api-key` headers (`app.module.ts:58`); request bodies are not logged.
- Welcome and receipt emails go only to an address the customer added themselves (`wallet_set_email`, `emailReceipt`).
