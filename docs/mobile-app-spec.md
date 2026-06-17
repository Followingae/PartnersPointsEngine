# Partners Points — Customer Mobile App (Design & Build Spec)

> Audience: **Claude Design** (to generate the full mobile UI) + engineering.
> Platform: iOS + Android (React Native / Expo assumed; design is framework-agnostic).
> This is the **customer-facing** app. Brand & superadmin consoles are separate web apps.

---

## 1. Product vision

A delightful, **loyalty-first wallet** where a customer holds a wallet per merchant
they're a member of, watches points grow, redeems rewards, and — for partner-enabled
merchants — **converts points into Lulu Happiness Points**. It should feel like a
**modern fintech app that's fun, not corporate**: generous white space, soft rounded
cards, playful accents and micro-interactions, big friendly numbers, banners for
offers — trustworthy but warm. Not a dense banking app; not childish.

### Design principles
- **Whitespace-first.** Let content breathe; few elements per screen.
- **One hero per screen.** A clear primary number/action up top.
- **Rounded & soft.** `rounded-3xl` cards, soft shadows, gentle gradients.
- **Playful accents, calm base.** Mostly light/neutral canvas; color used with intent.
- **Motion with meaning.** Points tick up, confetti on rewards/conversions, sheet
  transitions, pull-to-refresh.
- **Per-merchant identity.** Each wallet adopts the merchant's logo + brand color
  (we already store these in the brand's public profile: logo, primary color,
  description, address, website, socials).

---

## 2. Design system / tokens

Reuse the platform's brand language so app + consoles feel related.

- **Fonts**: Display = *Bricolage Grotesque* (headers, big numbers); Body = *Hanken
  Grotesk*; Mono = *IBM Plex Mono* (IDs, codes).
- **Core palette**: Ink `#15150f` (near-black), surfaces off-white `#fafaf7`,
  cards white. Accents — Lime `#c5f04a` / `#9bbe1e`, Coral `#ff6fa5`, Teal `#3bb0a8`,
  Blue `#5ba8fb`. Gradients: lime, coral, teal, ink (as used in the consoles).
- **Per-merchant theming**: each wallet pulls `branding.primaryColor` + `logoUrl`;
  fall back to a gradient when absent.
- **Radii**: cards `28px` (rounded-3xl), chips/pills full, inputs `16px`.
- **Shadows**: soft, low-opacity, large blur ("hero" shadow for the active card).
- **Spacing**: 4-pt scale; screens padded `20–24px`; generous `gap`.
- **Iconography**: lucide-style, 1.75px stroke.
- **Tone of copy**: friendly, concise, second person ("You earned 120 pts").

---

## 3. Navigation (bottom tab bar — 5 tabs)

1. **Home** (wallets overview) — house icon.
2. **Rewards** (catalog across merchants) — gift icon.
3. **Scan** (center, prominent) — the dynamic QR + scan-to-pay/earn — qr icon.
4. **Activity** (all transactions) — receipt icon.
5. **Profile** (account, linked partners, settings) — person icon.

The **Scan** tab is a raised center button (FAB-in-tabbar) — it's the most-used
in-store action.

---

## 4. Onboarding & authentication

### 4a. POS-initiated signup (primary path)
Many customers are **first enrolled at the merchant's POS terminal** (cashier
captures phone). So the app's first run is often "claim an account that already
exists," not a cold signup.

- **Welcome** → "Enter your mobile number" → **OTP** verification (matches our
  customer-auth: phone OTP).
- On first successful login, if the profile is sparse, run **progressive profiling**
  (see 4c) — this is where we collect the richer datapoints.

### 4b. Cold signup (app-first)
- Phone + OTP → create membership for the merchant they're engaging with (e.g. via a
  merchant QR or invite link / deep link).

### 4c. Progressive profiling (first login after POS enrollment)
A friendly, **skippable, multi-step** sheet (progress dots, one question per card):
- Name (first/last)
- Birthdate (drives birthday rewards) — date wheel
- Gender (Female / Male / Other / Prefer not to say) — chips
- Email (for receipts/offers)
- Optional: interests/preferences, marketing opt-in (explicit consent toggle)
These map to the customer fields the platform stores (name, gender, birthdate,
email/phone). Emphasize value ("Tell us your birthday for a birthday treat 🎂").

### 4d. Lulu account linking (contextual)
Not at onboarding — triggered the first time the customer tries to **convert** at a
Lulu-enabled merchant (see §8). Enter Lulu card/phone → verify via Lulu API → linked.

---

## 5. Home — Wallets overview

The signature screen.

- **Top bar**: greeting ("Hi, Sara 👋"), small avatar (→ Profile), a bell
  (notifications).
- **Banner carousel** (swipeable): promos — happy-hour double points, new rewards,
  "Convert to Lulu Happiness Points", birthday treat. Bold imagery, rounded, dot
  indicators.
- **Wallets**: a vertical list (or coverflow) of **merchant wallet cards** — one per
  membership:
  - Merchant logo + name, brand-colored gradient header.
  - **Big balance** (points) with the merchant's points label (e.g. "1,250 Beans").
  - Tier chip + progress ring/bar to next tier.
  - Small footnotes: points expiring soon, a "Lulu" badge if convertible.
  - Tap → **Merchant wallet detail**.
- **Empty state**: "No wallets yet — scan a merchant's QR or visit a partner store
  to start earning." with a Scan CTA.
- Pull-to-refresh; subtle count-up animation on balances.

---

## 6. Merchant wallet detail

- **Hero**: brand gradient, logo, balance, tier + progress ("320 pts to Gold").
- **Quick actions row**: **Show my QR** (dynamic), **Convert** (if Lulu-enabled),
  **Rewards**.
- **How you earn** (from the merchant's earn rules, plain language): e.g. "1 pt per
  AED 1 · 2× happy hour Thu 4–6pm".
- **Rewards strip**: redeemable rewards (cost in points), tap → redeem.
- **Activity** (this merchant): earns, redeems, conversions, expiries.
- **About the merchant**: from the public profile we store — description, address
  (map link), website, socials, opening hours. Makes the wallet feel like a mini
  storefront.

---

## 7. Scan / Dynamic QR

- **My QR (earn/identify)**: a **dynamic, rotating QR** encoding the customer's
  membership identifier for the *currently selected merchant* (or a universal
  identity the POS resolves). Rotates every ~30–60s / single-use token for security;
  shows a countdown ring. Big, centered, brand-colored frame, brightness boost.
  - Merchant selector at top (which wallet this QR is for).
- **Scan a code**: camera to scan a merchant's join QR (start a new wallet) or a
  reward/redemption code.
- States: no camera permission (explain + settings link), success toast.

---

## 8. Convert to Lulu Happiness Points (the partnership flow)

Entry points: the **Convert** quick action on a Lulu-enabled merchant wallet, or a
Home banner.

1. **Intro / link gate** — if Lulu account not linked: a friendly explainer
   ("Turn your {Merchant} points into Lulu Happiness Points") → **Link your Lulu
   account** (enter Lulu card/phone → verify) → linked confirmation.
2. **Convert sheet** (bottom sheet, white-spacey):
   - Source: the merchant wallet + available balance.
   - **Amount**: a slider + numeric input (snap to allowed increments; min/max).
   - **Live conversion preview**: "{X} {Merchant} pts → **{Y} Lulu Happiness Points**"
     with the ratio shown subtly; any fee disclosed.
   - Destination: linked Lulu account (masked ref).
   - Confirm button (disabled if ineligible / merchant allowance depleted).
3. **Processing** — playful loader (points "flying" from merchant to Lulu).
4. **Success** — confetti, "You converted! {Y} Lulu Happiness Points added to your
   Lulu account," reference number, "View in Lulu" hint, done.
5. **Failure states** (clear, kind):
   - *Merchant allowance temporarily out* → "Conversions are paused for {Merchant}
     right now. Try again later." (no points lost).
   - *Lulu unreachable* → "We couldn't reach Lulu — your points are safe, try again."
   - *Below minimum / over daily cap* → inline validation.
- **Conversion history**: in Activity, filterable; each shows merchant pts in, Lulu
  pts out, status, reference.

This flow must make the **safety** obvious: points are only deducted when Lulu
confirms (mirrors the backend's atomic + reversible conversion).

---

## 9. Rewards (catalog)

- Cross-merchant rewards browser (filter by merchant), each reward card: image,
  name, **points cost**, "Redeem" (affordability state).
- **Redeem flow**: confirm → issue a **voucher** (QR/code) → "Show at till" screen
  with the voucher QR + expiry; saved under Activity / a Vouchers area.

---

## 10. Activity

- Unified, reverse-chronological feed across wallets: **earned**, **redeemed**,
  **converted (Lulu)**, **expired**, **bonus/campaign**, with merchant logo, signed
  amount, timestamp, and a colored category dot.
- Filters: by merchant, by type. Tap → transaction detail (with reference).

---

## 11. Profile & settings

- **Header**: avatar, name, member since.
- **Personal details**: name, birthdate, gender, email, phone (edit; the data we
  collect during progressive profiling).
- **Linked partners**: Lulu account (linked/unlink), shows masked ref + status.
- **Notifications**: toggles (points earned, expiring soon, offers/happy-hour,
  conversion updates, birthday).
- **Privacy & data**: download my data, delete my account (GDPR — maps to our
  erase/export endpoints), consent toggles.
- **App**: language (English), appearance, help/support (uses the merchant/platform
  support email), terms & privacy, app version, sign out.

---

## 12. Notifications (push + in-app)

Triggers: points earned (after a POS transaction), points expiring soon, reward
unlocked/affordable, **happy-hour live** at a favorite merchant, **conversion
success/failure**, birthday treat, low-nudge ("you're 50 pts from a reward").

---

## 13. Screen inventory (for generation)

1. Splash / Welcome
2. Phone entry → OTP verify
3. Progressive profiling (name, birthdate, gender, email, consent) — 4–5 cards
4. Home / Wallets (banners + wallet cards)
5. Merchant wallet detail
6. Scan: My dynamic QR
7. Scan: camera scanner
8. Convert — link Lulu account
9. Convert — amount & preview sheet
10. Convert — processing
11. Convert — success / failure
12. Conversion history
13. Rewards catalog
14. Reward detail → redeem
15. Voucher (show at till)
16. Activity feed + filters
17. Transaction detail
18. Profile
19. Personal details (edit)
20. Linked partners (Lulu)
21. Notification settings
22. Privacy & data (export/delete)
23. Empty states (no wallets, no activity, no rewards)
24. Error/offline states

Each screen needs **loading, empty, error, and success** variants.

---

## 14. Key components (design once, reuse)

- **WalletCard** (brand-themed, balance, tier ring, Lulu badge).
- **BalanceHero** (big number + label + delta).
- **TierProgress** (ring or bar with "X to next").
- **Banner** (image, title, CTA, dot pager).
- **DynamicQR** (QR + rotation countdown + merchant selector).
- **ConvertSheet** (slider, live preview, confirm).
- **RewardCard** + **VoucherTicket** (perforated-ticket look, QR).
- **ActivityRow** (logo, title, signed amount, category dot).
- **ProfileField** (label + value + edit).
- **StepperSheet** (progressive profiling).
- **StatusToast / ConfettiSuccess**.

---

## 15. States & edge cases to design

- Brand-new user, zero wallets.
- Merchant not Lulu-enabled (hide Convert) vs enabled-but-paused (allowance out).
- Lulu account not linked vs linked vs link failed.
- Points expiring banner; expired points in activity.
- Offline / API error (cached balances + retry).
- Reward not affordable (locked CTA with "X more pts").
- Happy-hour active (live badge on earn-rate + banner).
- Permission denials (camera, notifications).

---

## 16. How this maps to the backend (for engineering)

- **Auth**: phone OTP (customer-auth surface).
- **Wallets/balances/tier/earn-rules/rewards**: existing brand `manage`/customer
  endpoints (balance, profile/360, rewards catalog, redeem→voucher).
- **Profile datapoints**: the `contact` fields (name, gender, birthdate, email,
  phone) — already on the customer profile.
- **Merchant storefront**: the brand **public profile** (logo, color, description,
  address, website, socials) from settings `branding`.
- **Dynamic QR**: short-lived membership token (new lightweight endpoint; reuse
  identifier + HMAC/expiry like the terminal contract).
- **Convert**: the new **Partnerships/Conversion** API (see `partnerships-lulu-plan.md`)
  — link account, preview, convert (atomic + reversible), history.
- **Notifications**: messaging/outbox + push tokens.
- **GDPR**: existing export/erase endpoints.

---

## 17. Out of scope (v1)
- In-app payments/checkout.
- Non-Lulu partners (the model is partner-generic; design the Convert flow so the
  partner name/branding is parameterized for future partners).
- Arabic / multi-language (English only for now).
