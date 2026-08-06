# Store submission — getting the two keys

Both stores are driven from EAS, so both need a machine credential. Neither key
goes in this repo: `eas credentials` uploads them to EAS and they are used
automatically from then on. That is why `eas.json` names no key paths.

Do these in order. The Apple one has the longer tail.

---

## 1 · App Store Connect API key (iOS)

You need to be **Account Holder or Admin** in App Store Connect to create one.

1. App Store Connect → **Users and Access** → **Integrations** tab
   (this was called "Keys" until recently).
2. Select **App Store Connect API** → **Team Keys**.
3. **+** to generate a key. Name it something you will recognise in a year —
   `EAS Submit` does the job.
4. Access role: **App Manager**. Admin also works and grants more than
   submitting needs, so App Manager is the better choice.
5. **Download the `.p8`.** It is offered exactly once — there is no second
   chance, and a lost key has to be revoked and replaced.
6. From the same page, note two more values:
   - **Key ID** — on the key's row
   - **Issuer ID** — at the top of the page, shared across all your keys

Then hand it to EAS:

```bash
cd apps/mobile
npx eas-cli credentials
#  → iOS → production → App Store Connect API Key → set up a new key
#  → point it at the .p8, paste the Key ID and Issuer ID
```

Signing certificates and provisioning profiles need no manual work: EAS
generates and renews them on the first build.

### Registering the bundle ID

The app record won't offer a bundle ID that doesn't exist yet, so this comes
first.

developer.apple.com → **Certificates, Identifiers & Profiles** → **Identifiers**
→ **+**

- Type **App IDs** → **App**
- Description: `Partners Points`
- Bundle ID: **Explicit**, `ae.partnerspoints.app` — character for character what
  `app.json` says, or builds fail to sign
- Capabilities: none for now. **Wallet** gets ticked when the pass certificates
  arrive; it can be added later without disruption.

A bundle ID **cannot be renamed or deleted** once used. Read it twice.

### Creating the app record

App Store Connect → **Apps** → **+** → **New App**

| Field | Value |
|---|---|
| Platforms | iOS only |
| Name | `Partners Points` — 30 characters max, unique across the entire App Store |
| Primary Language | English (U.K.) |
| Bundle ID | `ae.partnerspoints.app` from the dropdown |
| SKU | `partners-points-ios` — internal, never shown, permanent |
| User Access | Full Access |

If the name is taken the form says so immediately. `Partners Points UAE` and
`Partners Points Loyalty` both still read as ours. The name is reserved the
moment the record exists, so creating it early is worth doing even when the
build is weeks away.

### `ascAppId`, and when you need it

`submit.production.ios` is currently empty, which works for an interactive
submit: EAS finds the app from the bundle identifier and asks you to confirm.

**It does not work with `--non-interactive`.** Unattended, EAS refuses to guess
and fails with *"Set ascAppId in the submit profile"*. So the moment submits
run from CI, or from any script that cannot answer a prompt, `ascAppId` has to
be pinned:

```json
"ios": { "ascAppId": "1234567890" }
```

Note that `eas.json` is schema-validated and rejects unknown keys — including
comment keys like `_comment`. Explanations go here, not in that file.

The two values, if you need them:

- **`ascAppId`** — the app's **App Information** page, field labelled
  **Apple ID**. Ten digits; unrelated to the email address you sign in with.
- **`appleTeamId`** — developer.apple.com → **Membership details**. Ten
  alphanumeric characters.

Both pages need **Account Holder or Admin**.

---

## 2 · Google Play service account (Android)

1. **Google Play Console** → **Setup** → **API access**.
2. Link a Google Cloud project — create one if you have none.
3. In **Google Cloud Console** → **IAM & Admin** → **Service Accounts** →
   **Create service account**. A name is all it needs; skip the optional role
   grants at the GCP end.
4. Open the new account → **Keys** → **Add key** → **Create new key** →
   **JSON**. It downloads immediately.
5. Back in **Play Console** → **Users and permissions** → **Invite new users**,
   and invite the service account's email address.
6. Grant it, per app: **Release to testing tracks** and **Release to production**.
   Avoid account-wide Admin — this credential only ever needs to ship builds.

Then:

```bash
cd apps/mobile
npx eas-cli credentials
#  → Android → production → Google Service Account → upload the JSON
```

> **The very first Android release cannot be automated.** Google refuses API
> uploads for an app that has never had a build uploaded by hand. Build the AAB
> with `npx eas-cli build -p android --profile production`, download it, and
> upload it once through the Play Console. Every release after that goes through
> `npx eas-cli submit`.

---

## 3 · Submitting

```bash
# build
npx eas-cli build -p ios --profile production
npx eas-cli build -p android --profile production

# submit the most recent build
npx eas-cli submit -p ios --profile production
npx eas-cli submit -p android --profile production
```

`autoIncrement` is on for the production profile, so build numbers rise on their
own — a repeated build number is rejected at upload, before review, and it is an
easy thing to trip over by hand.

Android submits to the **internal** track as a **draft**. That is deliberate:
nothing reaches the public until you promote it in the Play Console, so a
mistaken `eas submit` cannot ship to users.

---

## Keeping the keys safe

- Neither key belongs in git. Better still, neither needs to be in the working
  tree at all: once EAS holds them, delete your local copies.
- `.gitignore` covers `*.p8`, `*.p12`, `*.keystore`, `*.jks`, a `secrets/`
  directory, and anything matching `*service-account*.json`. That last pattern
  exists because Google hands you the key named after the project —
  `rfm-partners-points-e4e293781a82.json` — which no extension rule would
  have caught.
- The `.p8` and the Play JSON are both **publish credentials**. Anyone holding
  one can ship a release under your name.
- The Android **upload keystore** is the one thing that cannot be reissued —
  it is the app's identity on Play. EAS holds it; leave it there rather than
  downloading copies.
- Both keys are revocable from their consoles if one ever leaks. Revoke first,
  ask questions after.
