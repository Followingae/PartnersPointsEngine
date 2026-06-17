# Partners Points — Customer Mobile App (Complete Design & Build Spec)

> Audience: **Claude Design** (generate the full mobile UI) + engineering.
> Platform: iOS + Android. Customer-facing app only (brand & superadmin are web).
> This is the **definitive, complete** spec — every screen, both onboarding paths,
> the design north-star, components, states, and backend mapping.

---

## 1. Product vision

A **loyalty-first wallet**: the customer holds one wallet per merchant, watches
points grow, redeems rewards, discovers nearby partner merchants, and — for
Lulu-enabled merchants — **converts points into Lulu Happiness Points**. It should
feel like a **best-in-class consumer fintech app that's warm and fun, not corporate
banking** — generous whitespace, big friendly numbers, soft rounded cards, tasteful
motion, banners for offers.

---

## 2. Design inspiration — the visual north star (paint the picture)

**Mood in one line:** *"Monzo's friendly boldness × Revolut's crisp data clarity ×
Starbucks Rewards' warmth × Cash App's confident simplicity — wrapped in Partners
Points' lime/ink brand."*

Direction (current award-winning consumer-fintech/loyalty design — see Sources):
bold high-contrast typography, **rounded cards**, and a **playful-but-trustworthy**
feel are the consensus; wallet cards should read like a polished Apple/Google Wallet
pass (clear logo, brand color, big points number, scannable code).

Concretely, Claude Design should emulate:

- **Canvas:** light, airy off-white (`#FAFAF7`), lots of negative space. Content
  floats on white cards with **soft, large, low-opacity shadows** (no harsh borders).
- **Hero numbers:** balances are huge, tight-tracked **Bricolage Grotesque** display
  type — the points balance is the loudest thing on screen (à la Revolut/Robinhood
  balance, but rounder/warmer).
- **Wallet cards = the signature object:** each looks like a premium membership card —
  a **brand-colored gradient header** with the merchant logo, the big balance, a tier
  ring, and a subtle texture/sheen. Stack/carousel them like cards in a wallet
  (Apple Wallet / Cash App card stack energy).
- **Color with intent:** mostly neutral; lime = positive/earn, coral = spend/redeem,
  teal = convert/partner, ink = structure. Gradients used on heroes and CTAs, never
  everywhere.
- **Rounded everything:** cards `28px`, sheets `28px` top corners, pills fully round.
- **Illustration & emoji:** light, friendly spot illustrations and the occasional
  emoji in copy ("🎂 Birthday treat") — fun, never childish.
- **Motion (essential to the feel):** balances **count up**, points **fly** between
  wallets during a convert, **confetti** on reward/convert success, springy bottom
  sheets, pull-to-refresh, a rotating **QR with a countdown ring**.
- **Tone of copy:** second person, short, warm. "You earned 120 pts at Camel Bean."
- **Tab bar:** floating, rounded, with a raised center **Scan** button.

Reference vibe (for moodboarding): Monzo, Revolut, Cash App, Starbucks Rewards,
Robinhood, N26, Dribbble "digital wallet / loyalty" collections, Awwwards fintech
winners. Aim for that production polish.

---

## 3. Design system / tokens

- **Fonts:** Display = *Bricolage Grotesque*; Body = *Hanken Grotesk*; Mono = *IBM
  Plex Mono* (IDs/codes). (Same family as our web consoles, for brand cohesion.)
- **Palette:** Ink `#15150f`; canvas `#FAFAF7`; card `#FFFFFF`. Accents: Lime
  `#9BBE1E`/`#C5F04A`, Coral `#FF6FA5`, Teal `#3BB0A8`, Blue `#5BA8FB`, Amber
  `#FFAB3D`. Gradients: lime, coral, teal, ink.
- **Per-merchant theming:** wallet + merchant screens adopt the merchant's
  `branding.primaryColor` + `logoUrl`; graceful gradient fallback.
- **Radii:** cards/sheets `28px`, inputs `16px`, pills full.
- **Shadows:** soft hero shadow (large blur, ~8% opacity) for active cards.
- **Spacing:** 4-pt scale; screen padding `20–24px`; comfortable gaps.
- **Type scale:** Display XL (balances) → H1 → H2 → body → caption → mono-xs.
- **Dark mode:** support (ink canvas, elevated cards) — design both.
- **Accessibility:** AA contrast, 44pt touch targets, dynamic type, reduced-motion
  variant, VoiceOver labels.

---

## 4. Information architecture (bottom tabs)

1. **Home** — wallets + banners.
2. **Discover** — find/join merchants (map + list).
3. **Scan** (raised center) — my dynamic QR + camera scanner.
4. **Activity** — unified transaction feed.
5. **Profile** — account, partners, settings.

(Rewards is reachable from Home, each wallet, and a Home shortcut — not its own tab,
to keep the bar to 5.)

---

## 5. Onboarding & auth — fully dynamic

The app must handle **every entry state**, not just POS-pre-enrolled.

### 5.1 First-run value carousel (cold installs)
3–4 swipeable slides (skippable): "All your loyalty in one wallet," "Earn in-store &
online," "Turn points into Lulu Happiness Points," "Rewards you'll actually use."

### 5.2 Auth = phone + OTP (single entry for everyone)
- Enter mobile number → **OTP**. The backend resolves what happens next **dynamically**:
  - **Existing memberships found** (e.g. POS-enrolled, or returning user): land
    straight in Home with their wallets; if the profile is sparse, gently prompt
    progressive profiling (§5.4) — **non-blocking**.
  - **Brand-new number** (cold download, never seen at a POS): create the account,
    then **Discover** to find their first merchant (§7), or accept a deep-link/QR if
    they arrived via one.
- Optional **email** as an alternate identifier later (Profile).
- After first login: offer **biometric unlock** (Face/Touch ID) + optional app PIN.

### 5.3 Entry variants the app must support
- **Cold app download** (no prior record) → signup → Discover/join.
- **POS pre-enrolled** (cashier captured phone) → claim on first login.
- **Deep link / merchant QR / referral link** → join that specific merchant on signup.
- **Returning user / new device** → OTP + biometric, restore wallets.

### 5.4 Progressive profiling (dynamic, never a hard wall)
Collect richer datapoints **opportunistically** with a skippable, one-question-per-card
stepper, surfaced at the right moments (first login, or a dismissible Home card
"Complete your profile +50 pts"):
- Name, **birthdate** (birthday rewards), **gender**, email, interests, marketing
  consent (explicit toggle).
- Show value + a small completion meter. These map to the customer fields we store
  (name/gender/birthdate/email/phone). Works whether the user came from POS or cold.

### 5.5 Lulu account linking (contextual, not at signup)
Triggered the first time they tap **Convert** at a Lulu-enabled merchant: enter Lulu
card/phone → verify via Lulu API → linked. Manageable later in Profile → Linked
partners.

---

## 6. Home — wallets overview

- **Top bar:** greeting + avatar (→Profile), notifications bell (→Notification center).
- **Banner carousel:** promos (happy-hour 2×, new reward, "Convert to Lulu," birthday
  treat). Bold imagery, dot pager, auto-advance.
- **Wallet stack/list:** merchant wallet cards (logo, brand gradient, big balance +
  points label, tier ring + "X to next," badges: "Lulu", "expiring soon"). Tap → detail.
- **Quick actions:** Scan, Discover, Rewards.
- **Profile-completion nudge** card if sparse (dismissible).
- **Empty state** (cold user, no wallets): friendly illustration + "Find a merchant"
  → Discover.
- Pull-to-refresh; balance count-up.

---

## 7. Discover — find & join merchants (critical for cold users)

- **Search** merchants by name; **map view** (store locator using the merchant's
  address) + **list** (nearby / featured / categories).
- **Merchant preview**: logo, description, where to find them, "what you earn,"
  Lulu-enabled badge → **Join** (creates a membership/wallet) or "Scan in-store."
- Featured/partner merchants surfaced (incl. Lulu Awarding Merchants).

---

## 8. Merchant wallet detail

- **Hero:** brand gradient, logo, balance, tier + progress.
- **Quick actions:** **Show my QR**, **Convert** (if Lulu-enabled), **Rewards**.
- **How you earn:** plain-language earn rules ("1 pt/AED · 2× happy hour Thu 4–6pm").
- **Tiers & benefits:** current tier, next tier, the perks each tier unlocks.
- **Rewards strip** → redeem.
- **Challenges/badges** for this merchant (if gamification on).
- **Activity** (this merchant).
- **About the merchant:** description, address + map, opening hours, website, socials,
  phone (from the brand public profile) — a mini storefront.

---

## 9. Scan / dynamic QR

- **My QR (identify/earn):** a **rotating, single-use** QR encoding the membership
  identifier for the selected merchant; countdown ring; brightness boost; merchant
  selector. Cashier scans it to award/redeem.
- **Scan a code:** camera → merchant join QR (new wallet), reward/voucher code, or
  pay-and-earn code. Permission-denied state with settings link. Success toast.

---

## 10. Rewards & vouchers

- **Catalog** (per merchant + a cross-merchant browse): reward cards (image, name,
  **points cost**, affordability state, tier-locked badges).
- **Reward detail** → **Redeem** → confirm → issues a **Voucher** (perforated-ticket
  UI with QR/code + expiry). 
- **My vouchers**: active/used/expired; "Show at till."

---

## 11. Convert to Lulu Happiness Points (partnership flow)

Entry: **Convert** on a Lulu-enabled wallet, or a Home banner.

1. **Intro / link gate** (if not linked): explainer → link Lulu account → confirmation.
2. **Convert sheet:** source wallet + balance; **amount** slider + numeric (min/max,
   increments); **live preview** "{X} {Merchant} pts → **{Y} Lulu Happiness Points**"
   (ratio subtle, fee disclosed); destination (masked Lulu ref); confirm (disabled if
   ineligible / merchant allowance depleted).
3. **Processing:** points-fly animation.
4. **Success:** confetti, "{Y} Lulu Happiness Points added," reference number, done.
5. **Failure (kind, safe):** allowance paused / Lulu unreachable / below-min / over
   daily-cap — **no points lost** (atomic + reversible backend).
- **Conversion history** in Activity. Designed **partner-generic** (parameterize the
  partner name/logo for future partners).

---

## 12. Activity & receipts

- Unified, reverse-chronological feed across wallets: **earned, redeemed, converted,
  expired, bonus/campaign, adjustment** — merchant logo, signed amount, category dot,
  timestamp. Filters (merchant, type, date).
- **Transaction detail / receipt:** amount, merchant, branch/terminal, reference,
  related reward/voucher, status; share/save receipt.

---

## 13. Gamification

- **Challenges:** progress cards ("Visit 5× this month → 200 pts"), progress bars.
- **Badges:** earned/locked grid, badge detail, celebratory unlock.
- **Streaks** (optional): visual streak counter.

---

## 14. Referrals

- "Invite a friend" → share link/code; track invited/qualified; reward on qualify.

---

## 15. Coupons / targeted offers

- Personalized offers + coupon codes (segments/campaigns), redeemable in-store/online;
  "clip" to wallet; expiry.

---

## 16. Notifications center

- In-app inbox mirroring push: points earned, expiring soon, reward affordable,
  **happy-hour live**, conversion success/failure, birthday, referral qualified.
  Read/unread, deep-link to the relevant screen.

---

## 17. Profile & settings

- **Header:** avatar, name, member since, profile-completion meter.
- **Personal details:** name, birthdate, gender, email, phone (edit).
- **Linked partners:** Lulu (linked/unlink, masked ref, status); future partners.
- **Payment/cards:** out of scope v1 (placeholder).
- **Notifications:** granular toggles.
- **Security:** biometric unlock, app PIN, **manage devices/sessions**, change number.
- **Privacy & data (GDPR):** download my data, delete account, consent toggles (maps
  to our export/erase endpoints).
- **Appearance:** light/dark.
- **Support:** Help center / FAQ, contact (merchant/platform support), report a problem.
- **About:** terms, privacy, app version, sign out.

---

## 18. Help & support
- Searchable FAQ, contextual help, "contact support" (email/chat placeholder),
  report-a-problem with the relevant transaction attached.

---

## 19. Complete screen inventory (grouped)

**Onboarding/auth**
1. Splash · 2. Value carousel · 3. Phone entry · 4. OTP verify · 5. Biometric/PIN
setup · 6. Progressive profiling stepper (name/birthdate/gender/email/consent) ·
7. "Account found — welcome back" vs 8. "Let's find your first merchant" (dynamic)

**Home & discovery**
9. Home/Wallets · 10. Banner detail/promo · 11. Discover (search/list) · 12. Discover
map · 13. Merchant preview · 14. Join program confirmation · 15. Empty wallets state

**Wallet & merchant**
16. Merchant wallet detail · 17. Tiers & benefits · 18. How-you-earn detail ·
19. About merchant (storefront)

**Scan**
20. My dynamic QR · 21. Camera scanner · 22. Scan result/success

**Rewards**
23. Rewards catalog · 24. Reward detail · 25. Redeem confirm · 26. Voucher (show at
till) · 27. My vouchers

**Convert (Lulu)**
28. Convert intro/link gate · 29. Link Lulu account · 30. Link success · 31. Convert
amount+preview sheet · 32. Processing · 33. Success · 34. Failure states ·
35. Conversion history

**Activity**
36. Activity feed · 37. Filters · 38. Transaction detail/receipt

**Gamification & growth**
39. Challenges · 40. Badges grid · 41. Badge detail/unlock · 42. Referrals ·
43. Coupons/offers

**Account**
44. Notification center · 45. Profile · 46. Edit personal details · 47. Linked
partners · 48. Notification settings · 49. Security (biometric/PIN/devices) ·
50. Privacy & data (export/delete) · 51. Appearance · 52. Help/FAQ · 53. Contact
support · 54. About/legal · 55. Sign out confirm

**System states (apply across):** loading skeletons, empty, error/offline (cached
balances + retry), permission denials, maintenance, force-update.

---

## 20. Component library (design once, reuse)
WalletCard · BalanceHero · TierRing/Progress · Banner/PromoCarousel · DynamicQR
(+countdown) · MerchantStorefrontHeader · RewardCard · VoucherTicket · ConvertSheet ·
AmountSlider · ActivityRow · TransactionReceipt · ChallengeCard · BadgeTile ·
ProfileField · StepperSheet (progressive profiling) · OTPInput · MapPin/StoreCard ·
NotificationRow · StatusToast · ConfettiSuccess · EmptyState · SkeletonLoaders ·
BottomSheet · SegmentedControl.

---

## 21. Accessibility & quality bar
AA contrast, dynamic type, 44pt targets, VoiceOver/TalkBack labels, reduced-motion
fallbacks, haptics on key actions, full dark mode, RTL-safe layouts (even though copy
is English now).

---

## 22. Backend mapping (engineering)
- **Auth:** phone OTP (customer-auth). Dynamic post-login resolution = "list my
  memberships"; zero → Discover.
- **Wallets/balance/tier/earn-rules/rewards/redeem→voucher/activity:** existing
  customer + manage endpoints + Customer 360.
- **Profile datapoints:** the `contact` fields (name/gender/birthdate/email/phone).
- **Merchant storefront:** brand **public profile** (`branding`: logo, color,
  description, address, website, socials).
- **Discover/map:** brand directory + branch addresses.
- **Dynamic QR:** new short-lived signed membership token (reuse identifier + HMAC/expiry).
- **Convert:** the Partnerships/Conversion API (see `partnerships-lulu-plan.md`) —
  link, preview, convert (atomic+reversible), history.
- **Gamification/referrals/coupons:** existing badges/challenges/referrals/coupons.
- **Notifications:** messaging/outbox + push tokens.
- **GDPR:** existing export/erase.

---

## 23. Out of scope (v1)
In-app payments/checkout · non-Lulu partners (model is partner-generic — keep Convert
parameterized) · Arabic/multi-language (English only) · social feeds.

---

## Sources (design research)
- [Fintech Apps 2025: UI/UX Strategies That Convert — Naskay](https://naskay.com/blog/fintech-apps-2025-uiux-strategies/)
- [User Interfaces of Great Loyalty Apps: 12 Key Features — DevTeam.Space](https://www.devteam.space/blog/features-of-a-great-loyalty-app-user-interface/)
- [DesignRush 2025 App Design Award (UnitBank/DigiNeat)](https://markets.financialcontent.com/woonsocketcall/article/marketersmedia-2026-1-5-digineat-wins-prestigious-design-award-at-designrush)
- [30 Creative Loyalty Card Designs — Jeri Commerce](https://blog.jericommerce.com/resources/creative-loyalty-card-designs)
- [Google Wallet loyalty card brand guidelines](https://developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines)
- [Dribbble — digital wallet collection](https://dribbble.com/melaniekim/collections/7411767-digital-wallet)
