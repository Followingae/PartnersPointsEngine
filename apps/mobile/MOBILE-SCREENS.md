# Partners Points mobile (Expo) — porting conventions

Native Expo app (Expo Router v4, RN 0.76). Port each phone mock from the design
gallery `.design-ref/partners-points-app/Partners Points - App.dc.html` (repo root)
into **React Native**. The web design is HTML/CSS — translate it to RN primitives;
match the visual output, not the markup.

## HTML → React Native translation
- `<div>`→`<View>`, text→`<Text>` (ALL text must be inside `<Text>`), `<img>`→
  `<Image source={...}>`, `<button>`→`<Pressable>`, `<svg>`→`react-native-svg`
  (`Svg`,`Path`,`Circle`,`Rect`,`G`,`Defs`,`LinearGradient`/`Stop` for gradient fills;
  camelCase props: strokeWidth, strokeLinecap, strokeLinejoin).
- CSS gradients (`linear-gradient(...)`)→`expo-linear-gradient`'s `<LinearGradient
  colors={[...]} start={{x,y}} end={{x,y}}>`. A 135deg gradient ≈ start {x:0,y:0}
  end {x:1,y:1}; 120deg/150deg ≈ adjust start/end accordingly.
- Inline CSS → RN `style={{ }}` objects. RN differences: no `box-shadow` (use
  `shadowColor/Offset/Opacity/Radius` + `elevation`, or the `elevation()` helper in
  lib/tokens); `font:"700 15px X"` → `{ fontFamily: font.sans(700), fontSize: 15 }`;
  flex is default column; `gap` is supported; percentages as strings; no `aspect-ratio`
  string → use `aspectRatio` number; borders via `borderWidth`/`borderColor`.
- Fonts: import `{ font }` from `@/lib/tokens`. `font.sans(w)` (Plus Jakarta Sans),
  `font.display(w)` (Bricolage Grotesque — headings & big numbers), `font.mono(w)`
  (IBM Plex Mono — codes/labels). Never set a raw family string.
- Colors: theme tokens via `useTokens()` from `@/lib/theme` (canvas, card, ink, soft,
  faint, line, chip, barbg, map, mapline). Brand literals from `BRAND` in
  `@/lib/tokens` (blue #0B04D9, deep, lime, coral, purple, sky). Replace every
  `var(--x)` with `t.x` (where `const t = useTokens()`).
- Do NOT reproduce the fake "9:41" status bar or the phone bezel — the OS status bar
  + the `Screen` top safe-area inset handle that. Port the INNER screen content.

## Shared components (use these)
- `@/components/Screen` → `<Screen pad>` (scrolling, safe-area; `pad` clears the tab
  bar on the 5 tabs; `scroll={false}` for fixed screens; `background` to override) and
  `<BackButton fallback="/…" />`.
- The floating tab bar is rendered by the `(tabs)` navigator automatically — tab
  screens just render content inside `<Screen pad>`. Don't add a tab bar manually.

## Every screen is a default-exported component. Use `'use client'`? No — RN has no
such directive. Just export default. Navigate with `useRouter()` from expo-router
(`router.push('/wallet/123')`) or `<Link href>` from expo-router.

## Route map (Expo Router file layout under app/)
Tabs (file → URL): `(tabs)/home.tsx`→`/home`, `(tabs)/discover.tsx`→`/discover`,
`(tabs)/scan.tsx`→`/scan`, `(tabs)/activity.tsx`→`/activity`,
`(tabs)/profile.tsx`→`/profile`. (`app/index.tsx` already redirects launch→splash.)

Onboarding: `onboarding/splash.tsx`, `carousel.tsx`, `phone.tsx`, `otp.tsx`,
`biometric.tsx`, `profiling.tsx`, `account-found.tsx`, `first-merchant.tsx`.
After onboarding navigate to `/home`.

Pushed (no tab bar): `promo.tsx`, `merchant/[id].tsx` (preview), `merchant/[id]/about.tsx`,
`join/[id].tsx`, `wallets-empty.tsx`, `wallet/[id].tsx`, `wallet/[id]/tiers.tsx`,
`wallet/[id]/earn.tsx`, `discover/map.tsx`, `scan/camera.tsx`, `scan/result.tsx`,
`rewards.tsx`, `rewards/[id].tsx`, `rewards/[id]/redeem.tsx`, `voucher/[id].tsx`,
`vouchers.tsx`, `convert/intro.tsx`, `convert/link.tsx`, `convert/linked.tsx`,
`convert/index.tsx`, `convert/processing.tsx`, `convert/success.tsx`,
`convert/failure.tsx`, `convert/history.tsx`, `activity/filters.tsx`,
`activity/[id].tsx`, `challenges.tsx`, `badges.tsx`, `badges/[id].tsx`,
`referrals.tsx`, `offers.tsx`, `notifications.tsx`, `profile/edit.tsx`,
`profile/partners.tsx`, `profile/notifications.tsx`, `profile/security.tsx`,
`profile/privacy.tsx`, `profile/appearance.tsx`, `help.tsx`, `help/contact.tsx`,
`about.tsx`, `signout.tsx`, `states.tsx`.

NOTE: `merchant/[id].tsx` and `merchant/[id]/about.tsx` can't both exist as a file +
folder of the same name in Expo Router — put the preview at `merchant/[id]/index.tsx`
and about at `merchant/[id]/about.tsx`. Same pattern for `wallet/[id]/index.tsx`,
`rewards/[id]/index.tsx`, `convert/index.tsx`, `badges/[id].tsx`.

## Assets
Wordmarks/logos are in `assets/` — import with `require('@/assets/pp-wordmark-dark.png')`.
Pick light/dark wordmark via `useTheme().theme`.

## Wiring
Keep ported content static. Wire CTAs to navigate along the flow. Leave
`// TODO(api):` at real call sites (auth, convert). Animations: use
`react-native-reanimated` for the QR countdown, points-fly, confetti, count-ups.
