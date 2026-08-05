# Wallet passes — Apple and Google

Screens 70–73. The code is built and tested; both wallets are **switched off
until credentials are supplied**, and the app hides the button for a wallet the
server cannot issue to, so nothing is broken in the meantime.

---

## What works today

| Piece | State |
|---|---|
| `.pkpass` build, manifest, PKCS#7 signature | Done, 14 tests |
| Pass fields matching screens 70/71/72 | Done, asserted per screen |
| Google loyalty class + object + save link | Done |
| Google balance push after points move | Done (`WalletPassService.refresh`) |
| `Add to Apple/Google Wallet` in the app | Done, hidden until configured |
| **Apple auto-refresh of a saved pass** | **Not built** — see *Known gap* |

---

## Turning Apple on

Five variables. All are read at request time, so setting them and redeploying is
enough — no code change.

| Variable | Where it comes from |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.ae.partnerspoints.card` — register under Identifiers → Pass Type IDs |
| `APPLE_TEAM_ID` | The 10-character team id in the developer account |
| `APPLE_PASS_CERT_P12` | The Pass Type ID certificate exported as `.p12`, then base64'd |
| `APPLE_PASS_CERT_PASSWORD` | The export password you chose |
| `APPLE_WWDR_CERT_PEM` | Apple's WWDR intermediate (G4), PEM |

Getting the `.p12`:

```bash
# 1. Create a CSR, upload it to the Pass Type ID, download pass.cer
openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr \
  -subj "/emailAddress=you@partnerspoints.ae/CN=Partners Points/C=AE"

# 2. Convert the downloaded certificate and pair it with the key
openssl x509 -inform DER -outform PEM -in pass.cer -out pass.pem
openssl pkcs12 -export -out pass.p12 -inkey pass.key -in pass.pem

# 3. What goes in the variable
base64 -w0 pass.p12
```

The WWDR intermediate is a public download from Apple's certificate authority
page — it is not secret, and it is the certificate Apple checks the chain
against.

**The certificate expires yearly.** When it does, every new pass fails to sign
and passes already in wallets keep working. Put the renewal date in a calendar;
nothing in the system will remind you.

---

## Turning Google on

| Variable | Where it comes from |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | Google Pay & Wallet Console, once the issuer account is approved |
| `GOOGLE_WALLET_SA_EMAIL` | A service account in the same project |
| `GOOGLE_WALLET_SA_PRIVATE_KEY` | That account's PEM key (escaped `\n` is accepted) |

The service account needs the **Wallet Object Issuer** role, granted inside the
Wallet Console rather than in IAM.

Classes are created as `UNDER_REVIEW`. Google promotes them to approved after
their review; passes work throughout, so this does not block a launch.

---

## How adding a pass works

Google is a plain link — the phone opens `pay.google.com/gp/v/save/<jwt>` and the
class and object travel inside the JWT, so no API call is made to issue.

Apple needed more care. iOS adds a pass by *opening* it, which leaves the app,
so an `Authorization` header never arrives and an authenticated endpoint would
simply 401. The alternative — downloading the bytes in-app — needs native file
and sharing modules, and native modules cannot ship over an OTA update.

So the app asks for a link and opens it:

```
GET /v1/customer/wallet/passes/{membershipId}/apple   (authenticated)
  → { "url": "https://api.partnerspoints.ae/v1/passes/apple/<token>" }

GET /v1/passes/apple/<token>                          (public, token-verified)
  → the signed .pkpass
```

That token is signed with `JWT_ACCESS_SECRET`, **expires in 5 minutes**, is
typed `apple_pass` so an ordinary access token cannot stand in for it, and names
exactly one membership. Ownership is checked before it is minted, so a
membership belonging to somebody else reads as not-found rather than revealing
that it exists.

---

## Known gap: Apple passes don't refresh themselves

A pass already sitting in someone's wallet shows the balance it had when it was
added. Google's does update — `WalletPassService.refresh` patches the object
after points move. Apple's does not.

Closing it needs two things we don't have:

1. **The PassKit web service** — four endpoints Apple calls to register a
   device, list changed serials, and fetch an updated pass. Roughly a day's
   work, and it needs a `webServiceURL` and `authenticationToken` added to
   `pass.json`.
2. **An APNs certificate** for the same Pass Type ID, to tell the device to come
   and ask.

Until then the honest framing for a customer is that the pass is their card and
their code, not a live balance — the code is what the till reads, and it never
goes stale. The QR is correct regardless of what number is printed above it.

---

## Where things live

```
apps/api/src/modules/wallet-pass/
  apple-wallet.service.ts   pass.json, zip, PKCS#7 signing
  google-wallet.service.ts  class/object, save link, balance push
  pass-data.ts              the shared view both wallets render
  pass-images.ts            icon/logo PNGs, generated from the brand colour
  wallet-pass.service.ts    ownership, signed links, refresh
  wallet-pass.controller.ts the two routes above
apps/api/test/wallet-pass.test.ts
apps/mobile/components/AddToWallet.tsx
```

The tests sign with a throwaway self-signed certificate, so they verify
everything up to Apple's trust chain: zip entries, that every manifest digest
matches the bytes shipped, that the signature is detached DER, and that each
screen reads the way the design specifies — including "1 more wash" resolving
singular and "wash" pluralising to "washes".

What they cannot verify is that Apple accepts the chain. **The first real
certificate needs one manual test on a physical iPhone**, because a rejected
pass reports only "cannot be read".
