# Partners Points — Customer App Design Brief

**For:** the UI/UX design team (no prior context assumed)
**Platforms:** iOS + Android (one design system, native-feeling on both)
**Quality bar:** Talabat / Careem launch-grade polish
**Date:** 28 Jul 2026 · Owner: Zain (RFM Loyalty)

---

## 1. What you are designing

**Partners Points** is the consumer app of a loyalty platform that runs the rewards
programs for a growing family of UAE brands (cafés, restaurants, retail). One app,
many brands: a member carries a **wallet of brand cards** — each brand has its own
points balance, tier, and rewards — plus one cross-brand superpower: converting
points into **Lulu Happiness Points** (a major UAE retailer's currency).

It is **not** a delivery app, not a payments app, not a coupon aggregator. It is a
**loyalty-first wallet**: the fastest, most beautiful way to be recognized at a till,
watch points grow, and spend them on things people actually want.

The moment that matters most: a customer at a counter, cashier waiting, opens the
app → their QR is on screen within ~2 seconds → scanned → "+120 pts" lands with a
satisfying animation. Everything else in the app earns its place by making that
moment richer.

## 2. Background — the ecosystem you're plugging into

RFM (operating as **Partners Points**) is the program operator, not a SaaS vendor:

- **In stores:** our own Android payment terminals (Feitian hardware) run our
  cashier app — customer recognition by phone number or QR, awarding, redemptions
  at checkout ("pay with points" discounts), printed branded receipts.
- **Backoffice:** a superadmin console (us) and a brand console (per-brand
  visibility; changes route through our approval).
- **The engine:** double-entry points ledger, per-brand earn rules, tiers,
  campaigns, vouchers, badges/challenges/referrals, and per-brand **redemption
  valuation** (e.g. 100 pts = AED 1, capped % of the bill) — all server-owned.
- **Brand identity per merchant already exists** in the platform: logo + primary
  color per brand. Your per-brand card designs and wallet passes will be driven by
  those two inputs plus rules you define.
- **This app** is the last missing surface — the consumer face of all of it.

Business context worth knowing: membership is **closed-loop per brand** (points
earned at Brand A spend at Brand A), with the Lulu conversion as the deliberate
open-loop exception. Customers may already exist in the system (enrolled at a till
by phone number) before ever downloading the app — the app must feel like *finding
your points*, not signing up cold.

## 3. Who it's for

- **UAE consumers**, mirroring Talabat/Careem's audience: young professionals,
  families, students; Emiratis + large expat communities; iPhone-heavy but with a
  significant Android segment; English-first UI at launch, **Arabic/RTL is a
  designed-for certainty in phase 2** (grids and components must mirror cleanly).
- Three postures to design for:
  1. **At the till** (10-second, one-handed, cashier watching): Scan tab.
  2. **Commuting/at home** (browsing): balances, rewards, offers, challenges.
  3. **Deciding where to go** (discovery): brand directory, map, joining.
- Assume low patience and high design literacy — this audience lives in Talabat,
  Careem, Instagram, Apple Wallet daily.

## 4. Competitive & reference landscape

### Polish benchmarks (the bar)
| App | Study | Avoid |
|---|---|---|
| **Talabat** | Launch-feel, promo banner system, card density without clutter, localized warmth | Commercial noisiness — we are calmer |
| **Careem** | Motion & haptics quality, one-super-app IA discipline, Careem Plus subscription surfaces | Feature sprawl |
| **Apple Wallet** | The card metaphor done perfectly: stack, focus, color extraction, pass anatomy | Sterility — we add warmth |

### Loyalty apps to dissect (category truth)
| App | Why it matters |
|---|---|
| **Starbucks Rewards** | Gold standard of earn-visualization: progress ring, stars animation, tier celebration |
| **Smiles (e& UAE)** | Local multi-brand loyalty at scale — study IA, avoid its density/banner overload |
| **Shukran (Landmark)** | Regional multi-brand closed-loop; study onboarding + till flow |
| **The ENTERTAINER** | Offer redemption UX, "show at till" patterns |
| **U by Emaar / Blue Rewards (Al-Futtaim)** | Premium tier presentation, mall-context loyalty |
| **Costa Club / McDonald's app** | Stamp-card mechanics, simple reward ladders |

### Aesthetic north stars (non-category)
**Monzo** (friendly boldness), **Revolut** (crisp data, dark elegance), **Cash App**
(confident simplicity, oversized numerals), **Airbnb** (whitespace + editorial
photography), **Linear/Notion marketing pages** (typographic confidence). The brief
in one line: **"Monzo's warmth × Apple Wallet's card theatre × Talabat's local
fluency, with more air than all three."**

The client will supply additional visual references separately — treat those as
overriding this section where they conflict.

## 5. Design principles (rank-ordered)

1. **Air is the brand.** White-spacey, editorial layouts; generous margins (22–24pt
   gutters); one primary action per screen; nothing competes with the content.
2. **Brands provide the color; the shell stays neutral.** The app chrome is calm
   (near-white canvas, ink text). Color enters through **brand cards, banners, and
   moments of delight** — never through the chrome itself.
3. **Numbers are heroes.** Balances, earn amounts, and conversions are typeset big
   (display face, 44–64pt), with count-up animations. People open the app to see a
   number — honor it.
4. **Ten seconds at the till.** Scan is reachable in one tap from anywhere (center
   tab), renders instantly, works one-handed, and survives sunlight (max contrast
   mode when QR is showing).
5. **Celebrate, don't gamify-spam.** Confetti when points land or a reward unlocks;
   silence otherwise. No badges begging for attention.
6. **Feels native everywhere.** iOS and Android share the design language but
   respect platform conventions (navigation transitions, haptics, back gesture,
   share sheets, wallet buttons).

## 6. Visual language — starting points (evolve, don't ignore)

An earlier internal prototype established tokens that echo our merchant-console
brand. Treat these as the **starting palette**; you own the final system:

- **Canvas:** near-white `#FAFAF7` (light) / `#0f0f13` (dark). Cards pure white /
  `#1b1b21`. **Dark mode is in scope from day one** (system-following + manual).
- **Ink:** `#15150f`–`#262626` text; muted at 60% / 36% opacities.
- **Accents (fixed, platform-owned):** lime `#C5F04A`/`#9BBE1E` (success/earn),
  coral/blush `#FF6FA5` (burn/redeem), teal `#3BB0A8`, sky `#5BA8FB`, amber
  `#FFAB3D` (alerts/expiry). Electric blue `#0B04D9` + deep navy `#070459` exist in
  the prototype as gradient anchors — keep or kill, your call.
- **Type:** display **Bricolage Grotesque** (headlines, big numerals), body
  **Hanken Grotesk**, mono **IBM Plex Mono** (codes, IDs, timestamps). All free
  (Google Fonts), all support the weights needed. Arabic pairing proposal is part
  of your deliverables (e.g. IBM Plex Sans Arabic — your recommendation).
- **Shape:** soft and generous — 24–28pt card radii, full-round pills, squircle
  app icon energy. Soft diffuse shadows (no hard borders).
- **Spacing:** 4pt base grid; screen gutter 22–24pt.
- **Iconography:** single consistent set (custom or a quality library like Phosphor
  /Lucide, duotone-free, 1.5–2px stroke); filled variants for active tab states.
- **Illustration:** needed for empty states + onboarding — brief a style (warm,
  geometric, not corporate-Memphis). Photography only inside brand/banner content.
- Existing assets you'll receive: Partners Points wordmark (light/dark), logo
  marks, brand color/logo pairs for live merchants, console screenshots for tone.

## 7. The per-brand card system (the hero component)

Every membership renders as a **brand card** — the emotional core of the app.

**Inputs per brand (guaranteed by the platform):** logo (bitmap), primary color
(hex), brand name, points-unit label (e.g. "PTS", "Beans"). Optionally later: a
hero photo.

**Design requirements:**
- A card template that makes *any* logo+color combination look intentional:
  color-derived gradients (e.g. primary → darkened primary), auto light/dark
  foreground selection with a **WCAG AA contrast floor**, tasteful logo placement
  with a size/clear-space rule, graceful fallback when a brand has no color set
  (platform gradient).
- Card anatomy: brand identity zone, **balance** (big numeral + unit), tier chip +
  progress-to-next-tier bar, subtle "member since"/card-number mono line, optional
  stamp-progress strip (see §9), long-press → quick actions (Show QR / Rewards /
  Add to Wallet).
- **Wallet presentation:** the Home stack/carousel of cards (Apple-Wallet-style
  peek stack or horizontal snap carousel — explore both), reorder, one card focused
  state, skeleton shimmer while loading.
- States: default · tier-upgraded (celebration variant) · points-expiring (amber
  notice) · brand-paused · just-joined (first-earn nudge).

## 8. Promo & ad banner system

A first-class, designed **placement system** (we sell/schedule these internally):

- **Home hero carousel:** full-bleed-ish rounded banners (16:9-ish, explore),
  auto-advance with dots, deep-link to brand/offer/challenge. Design the template
  grid: image zone, headline, CTA chip, brand tag — so campaigns look consistent
  regardless of supplied art.
- **Inline placements:** slim banner between Home sections; sponsored tile inside
  Discover; contextual card in Activity ("You're 200 pts from a free coffee").
- **Rules to define:** max banners per screen (keep the air!), motion (subtle
  parallax ok, no autoplay video at launch), content template variants (image-led /
  color-led / countdown), dismissal behavior, "sponsored" labeling.

## 9. Wallet passes — Apple Wallet + Google Wallet (required deliverable)

Members must be able to add each brand card to their phone's native wallet, so the
till moment works even without opening our app. Brand logo+color (already in the
platform) drive the pass art. Design **templates**, not one-offs:

**Apple Wallet (PKPass, storeCard style):**
- Front: logo + logo text, strip image (this is where per-brand art lives —
  design the strip template: brand color gradient + pattern + optional stamp row),
  primary field (points balance), secondary fields (tier, member name), footer.
- **Stamp-card variant:** progress visualized on the strip (e.g. 7/9 coffee stamps
  as filled/unfilled marks) — design the stamp iconography and the "reward ready"
  celebratory strip state.
- Barcode: QR (rotating-token capable; assume a QR square + alt text).
- Back fields: balance detail, expiring points, support link, T&Cs.
- Design states: normal · reward-ready · points-expiring (passes support update
  notifications — design the lock-screen relevant moment).

**Google Wallet (Loyalty pass):**
- Equivalent template: hero image (same strip art system), program logo, program
  name, points module, tier row, QR, hex background color per brand.
- Accept that Google's layout is more rigid — the art system must degrade
  gracefully between the two.

**In-app integration:** official "Add to Apple Wallet" / "Add to Google Wallet"
badges (per platform guidelines — don't redraw them), placed on the wallet card
detail and the join-success moment.

## 10. Information architecture

Five tabs, floating rounded tab bar, raised center Scan button (58pt circle):

```
Home        — card stack/carousel, hero banners, expiring-points nudges, quick actions
Discover    — brand directory (list + map), search/filters, join flows
● Scan      — MY QR (default, instant) ⇄ camera scanner (join codes, vouchers, pay-and-earn)
Activity    — cross-brand transaction feed, filters, detail
Profile     — account, preferences, partners (Lulu link), help, legal
```

## 11. Complete screen inventory (A→Z)

Every screen needs: default + loading (skeleton, never spinners) + empty + error +
offline states. ~60 screens total.

**Onboarding & auth (8):** Splash (animated wordmark) · Value carousel (3 slides) ·
Phone entry (UAE-first picker) · OTP (auto-read, resend) · **Account-found** ("We
found your points — 2,480 pts at Camel Bean" — the magic moment for till-enrolled
members) · Biometric opt-in · Progressive profiling (name/birthday — skippable,
one question per card) · First-merchant suggestion.
Also: 4 entry variants — cold download / claim-at-login / **deep-link or QR join
straight into a brand** / returning device.

**Home (4):** Home (cards + banners + activity preview) · Wallets-empty (first-run
discovery push) · All-cards grid/reorder · Notifications inbox.

**Discover & join (7):** Directory list (cards w/ logo, category, distance,
"earn 1pt/AED" chip) · Map view · Search + filters · Brand storefront/preview
(public: about, branches, earn rules, rewards preview, photos) · Join
confirmation · Join-success (card materializes → "Add to Wallet") · Brand about/
branches detail.

**Wallet / brand detail (6):** Card detail (hero card, balance, tier progress,
quick actions: Show QR · Rewards · Convert · Add to Wallet) · How-you-earn sheet ·
Tier detail (ladder, benefits per tier, history) · Brand activity list · Expiring
points sheet · Per-brand settings (notifications from this brand).

**Scan (5):** My QR (rotating code + countdown ring, brand selector if multiple,
max-brightness mode) · Camera scanner (viewfinder, torch, manual code entry) ·
Scan result — earn (+points, confetti) · Scan result — error/expired · Pay-and-earn
result (paid AED X, earned Y, redeemed Z — mirrors the printed receipt).

**Rewards & vouchers (6):** Rewards catalog per brand (point costs, afford-state)
· Reward detail · Redeem confirmation sheet (cost, balance after) · **Voucher**
(the till-facing screen: barcode/QR + code, expiry, "mark used" — design like a
ticket, perforation and all) · My vouchers list (active/used/expired) · Redeem
success (celebration).

**Convert to Lulu (8):** Intro/explainer (the "why") · Link Lulu account · Linked
confirmation · Convert amount (slider/stepper, live conversion preview, fees/rate
clarity) · Review · Processing · Success (both balances animate) · Failure/retry ·
History list.

**Gamification & growth (6):** Challenges list + detail (progress bars, time
left) · Badges grid + badge detail (earned/locked) · Referrals (code, share sheet,
progress, reward state) · Streaks module (if used, keep subtle) · Offers/campaign
landing (banner destination template) · Celebration overlay system (tier-up,
badge, big earn — one consistent design).

**Activity (3):** Feed (grouped by day, earn/burn/convert/expiry color-coded) ·
Filters sheet · Transaction detail (with receipt-style layout matching our printed
terminal receipts).

**Profile & system (12):** Profile hub · Edit profile · Linked partners ·
Notification preferences · Security (biometric, sessions) · Privacy center (GDPR
export/delete — must be genuinely findable) · Appearance (light/dark/system) ·
Language (EN now, AR placeholder) · Help/contact · About/legal · Sign-out state ·
Force-update + maintenance screens.

**System-wide:** permission priming dialogs (camera, notifications — pre-prompt
explainer screens, never naked OS prompts) · offline banner · toast/snackbar
system · pull-to-refresh treatment · app icon + splash + store screenshot
templates (both stores).

## 12. Motion, haptics & sound

- **Signature moments (prototype these):** points count-up with overshoot; the
  "points fly" particle from scan-success into the brand card; card-stack settle
  physics; QR countdown ring; confetti burst (redemption/tier-up); balance
  number-roll on convert (both currencies simultaneously).
- Timing philosophy: 200–350ms, spring-based, interruptible. Motion = feedback,
  never decoration. Full reduced-motion variants.
- Haptics map (iOS + Android equivalents): scan success (success notification),
  redeem confirm (medium impact), tier-up (heavy + confetti), errors (rigid).
- Sound: none at launch except optional scan-success tick (define it anyway).

## 13. Content & formatting rules

- Voice: warm, brief, first-person-plural sparingly. "You're 200 pts away" not
  "User balance insufficient."
- Numerals: thousands separators always ("2,480 pts"); currency as "AED 12.50";
  dates humanized ("Today · 2:41 PM").
- Points language: "pts" universal; brand's custom unit label where the brand set
  one ("Beans").
- Bilingual future: leave 30–40% text expansion room; icons never rely on
  left-right direction; numerals stay LTR in RTL layouts.

## 14. Accessibility (non-negotiable)

WCAG AA contrast everywhere **including on brand-colored surfaces** (that contrast
floor in the card system does the heavy lifting) · dynamic type up to XL without
breakage on Home/Scan/Voucher · 44pt minimum targets · VoiceOver/TalkBack labels
for every balance and the QR ("your membership code for X") · reduced-motion ·
color-blind-safe earn/burn distinction (never color alone — use +/− and icons).

## 15. Deliverables & handoff

1. **Figma library:** tokens as variables (light+dark), full component set with
   variants/states, the brand-card and banner and pass **template components**
   wired to swap logo/color instantly (test with 6 dummy brands: dark logo, light
   logo, clashing color, no color, long name, Arabic name).
2. **All ~60 screens** in light + dark, plus state variants per §11.
3. **5 prototyped golden flows:** ① first open → account-found → show QR → points
   land ② browse → join brand → add pass to Apple Wallet ③ redeem → voucher at
   till ④ convert to Lulu ⑤ at-till pay-and-earn result.
4. **Motion specs** for the signature moments (Lottie/video + curves/durations).
5. **Wallet pass templates** (Apple + Google, normal + stamp + reward-ready
   states) as layered files with the strip-art generation rules documented.
6. **Store kit:** app icon (both platforms, incl. Android adaptive), splash,
   screenshot/feature-graphic templates.
7. **Design-decisions doc:** the rules a developer can implement (contrast floor
   algorithm, spacing scale, banner content rules).

Review cadence proposal: tokens+card system first (week 1) → golden flows →
full inventory → passes+motion. We review in the brand console's visual context.

## 16. Constraints & truths (so designs stay buildable)

- Recognition primitive is a **rotating QR token** (~12s refresh) — the countdown
  ring is real, design for it. Phone-number lookup is the cashier-side fallback —
  the app never needs to show the raw phone number at till.
- Balances/tiers/rewards/valuations all come from one server (same numbers as the
  cashier terminal and printed receipt — consistency is a feature, mirror the
  receipt aesthetic in Activity detail).
- Vouchers carry server-issued codes (QR/barcode) with expiry.
- Lulu conversion is atomic with a fixed disclosed rate; failure states are real.
- Brand assets are exactly **logo + one color** today — the templates must thrive
  on that minimal input (don't design assuming art direction per brand).
- Offline: cached balances shown with "as of" timestamp; My QR still renders
  (token pre-fetch); actions queue visibly.
- The existing Expo prototype (navigable, ~35 screens) will be provided as a
  functional reference of flows — **not** as visual direction to copy.

## 17. Glossary

**Earn/burn** — gaining/spending points · **Closed-loop** — points locked to one
brand · **Tier** — status level from lifetime points (multiplies earning) ·
**Redemption valuation** — platform-set rate turning points into AED discount ·
**Pay-and-earn** — till flow where a customer redeems and earns in one payment ·
**Lulu Happiness** — partner currency customers convert points into · **Stamp
card** — visit-count reward ladder (buy 9, get 1) · **PKPass** — Apple Wallet
pass file format · **Member token/QR** — short-lived scannable identity code.

---

*Questions → Zain. Backend/API feasibility questions → engineering (everything in
§11 maps to existing or already-specced endpoints; nothing here is speculative).*
