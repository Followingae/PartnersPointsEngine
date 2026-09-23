/**
 * The terminal API, endpoint by endpoint. Field lists mirror the DTOs in
 * apps/api/src/modules/terminal-gateway/dto.ts and the shapes returned by
 * terminal.service.ts. Keep them in step: this file is what partners build to.
 */

export type Field = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type ApiError = { status: number; code: string; when: string };

export type Endpoint = {
  slug: string;
  method: 'GET' | 'POST';
  path: string;
  title: string;
  group: 'Diagnostics' | 'Configuration' | 'Members' | 'Sales' | 'Rewards' | 'Receipts';
  summary: string;
  description: string[];
  pathParams?: Field[];
  query?: Field[];
  request?: Field[];
  requestExample?: unknown;
  response: Field[];
  responseExample: unknown;
  responseNote?: string;
  errors: ApiError[];
  notes?: string[];
};

const TOKEN_ERRORS: ApiError[] = [
  { status: 400, code: 'validation_error', when: '`invalid or expired member token` — resolve the customer again and retry.' },
  { status: 400, code: 'validation_error', when: '`member token brand mismatch` — the token was issued for another brand.' },
];

const AUTH_ERROR: ApiError = { status: 401, code: 'unauthorized', when: 'Signature, timestamp, nonce or key problem. See Authentication.' };

const TXN_FIELDS: Field[] = [
  { name: 'id', type: 'string', description: 'Transaction id. Use it for capture, void and status polling.' },
  { name: 'intent', type: '"earn" | "redeem"', description: 'What was requested.' },
  {
    name: 'state',
    type: 'string',
    description: 'One of `pending`, `authorized`, `captured`, `voided`, `expired`, `reversed`, `failed`. Earn goes straight to `captured`; redeem starts at `authorized`.',
  },
  { name: 'points', type: 'string | null', description: 'Points awarded (earn) or held (redeem), as a decimal string.' },
  { name: 'amountMinor', type: 'string | null', description: 'The sale amount you sent, echoed as a decimal string. `null` for redeem.' },
  { name: 'authJournalId', type: 'string | null', description: 'Ledger journal that placed the redeem hold. `null` for earn.' },
  { name: 'captureJournalId', type: 'string | null', description: 'Ledger journal that posted the points. Set once captured.' },
];

const TXN_EXAMPLE_REDEEM = {
  id: '019fc7a2-7f6e-7b1a-9c2d-3e4f5a6b7c8d',
  intent: 'redeem',
  state: 'authorized',
  points: '500',
  amountMinor: null,
  authJournalId: '019fc7a2-8a1b-7c2d-8e3f-4a5b6c7d8e9f',
  captureJournalId: null,
};

export const ENDPOINTS: Endpoint[] = [
  {
    slug: 'ping',
    method: 'GET',
    path: '/terminal/diagnostics/ping',
    title: 'Verify signing',
    group: 'Diagnostics',
    summary: 'Confirms your signature is valid and tells you which brand and terminal the key is scoped to. Changes nothing.',
    description: [
      'Call this first, and again whenever signing breaks. A `200` proves the header, canonical string and secret are all correct. A `401` means the signature is wrong; the four most common causes are listed under Authentication.',
      'The response also names the brand and terminal the key belongs to. Check it before a fleet rollout, in case two tills were handed the same key.',
    ],
    response: [
      { name: 'ok', type: 'true', description: 'Always `true` on a signed request.' },
      { name: 'brandId', type: 'string', description: 'The brand this key is scoped to.' },
      { name: 'actor.type', type: '"terminal"', description: 'The kind of credential that signed the request.' },
      { name: 'actor.id', type: 'string', description: 'The terminal (register) id behind the key.' },
    ],
    responseExample: {
      ok: true,
      brandId: '019fc6d1-1b2c-7d3e-8f4a-5b6c7d8e9f0a',
      actor: { type: 'terminal', id: '019fc6d1-2c3d-7e4f-9a5b-6c7d8e9f0a1b', onBehalfOf: null },
    },
    errors: [AUTH_ERROR],
  },
  {
    slug: 'config',
    method: 'GET',
    path: '/terminal/config',
    title: 'Get configuration',
    group: 'Configuration',
    summary: 'Brand identity, the terminal’s label and branch, and the redemption valuation every surface must agree on.',
    description: [
      'Call at start of day and cache. It tells you what the brand calls its points and how points convert to money, so any figure you show before quoting matches the receipt.',
      'Use `pointsCurrencyCode` in your UI. Brands name their own points, and “BEANS” on a receipt is worth more than “points”.',
    ],
    response: [
      { name: 'brand.name', type: 'string', description: 'Display name of the brand.' },
      { name: 'brand.currency', type: 'string', description: 'ISO-4217 money currency, e.g. `AED`.' },
      { name: 'brand.pointsCurrencyCode', type: 'string', description: 'What the brand calls its points, e.g. `BEANS`.' },
      { name: 'brand.branding', type: 'object', description: 'White-label theming (logo, palette). May be empty.' },
      { name: 'terminal', type: 'object | null', description: '`{ label, branchName }` for the register behind the key.' },
      { name: 'redemption.enabled', type: 'boolean', description: 'Whether points can be spent at the till.' },
      { name: 'redemption.configured', type: 'boolean', description: '`false` when the brand has not set a valuation yet and defaults are being returned.' },
      { name: 'redemption.ratePoints', type: 'string', description: 'Points side of the conversion rate.' },
      { name: 'redemption.rateValueMinor', type: 'string', description: 'Money side of the conversion rate, in minor units.' },
      { name: 'redemption.minRedeemPoints', type: 'string', description: 'Redemptions below this are refused.' },
      { name: 'redemption.maxPercentOfBillBps', type: 'number', description: 'Cap on the discount as basis points of the bill. `5000` = 50%.' },
      { name: 'redemption.roundToMinor', type: 'number', description: 'Round the discount down to this step, in minor units.' },
      { name: 'redemption.presetsPoints', type: 'number[]', description: 'Suggested amounts to offer as quick buttons.' },
    ],
    responseExample: {
      brand: { name: 'Camel Bean', currency: 'AED', pointsCurrencyCode: 'BEANS', branding: {} },
      terminal: { label: 'Till 2', branchName: 'JLT' },
      redemption: {
        enabled: true,
        configured: true,
        ratePoints: '100',
        rateValueMinor: '100',
        minRedeemPoints: '200',
        maxPercentOfBillBps: 5000,
        roundToMinor: 25,
        presetsPoints: [500, 1000],
      },
    },
    errors: [AUTH_ERROR],
    notes: ['Numeric strings are 64-bit integers. Parse them as big integers, never as a JavaScript `number`.'],
  },
  {
    slug: 'resolve-member',
    method: 'POST',
    path: '/terminal/members/resolve',
    title: 'Resolve a member',
    group: 'Members',
    summary: 'Turn a phone number, scanned code or loyalty id into a short-lived member token.',
    description: [
      'The token identifies the customer for one transaction and expires after **10 minutes**. Resolve at the start of a sale, not at the start of a shift.',
      'Use `qr` with the exact string scanned from the customer’s app. A `404` means this brand has no such member; offer to enrol them.',
    ],
    request: [
      { name: 'type', type: '"phone" | "email" | "qr" | "nfc" | "loyalty_id" | "card_token"', required: true, description: 'Which kind of identifier `value` is.' },
      { name: 'value', type: 'string', required: true, description: 'The identifier. Phone numbers in E.164, e.g. `+971501234567`.' },
    ],
    requestExample: { type: 'phone', value: '+971501234567' },
    response: [{ name: 'memberToken', type: 'string', description: 'Opaque token to pass to every other member call. Valid for 10 minutes.' }],
    responseExample: { memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
    errors: [
      { status: 404, code: 'not_found', when: 'No member with this identifier at this brand.' },
      { status: 400, code: 'validation_error', when: '`type` is not one of the allowed values, or `value` is missing.' },
      AUTH_ERROR,
    ],
  },
  {
    slug: 'enroll-member',
    method: 'POST',
    path: '/terminal/members/enroll',
    title: 'Enrol a member',
    group: 'Members',
    summary: 'Create a membership at the till from a phone number. Idempotent: an existing number simply resolves.',
    description: [
      'Phone must be E.164: a leading `+` followed by 8 to 15 digits. The customer completes their profile later in the Partners Points app.',
      'Enrolling a number that already has a membership returns its token with `created: false`, so you can call this without checking first.',
    ],
    request: [
      { name: 'phone', type: 'string', required: true, description: 'E.164 phone, e.g. `+971509876543`.' },
      { name: 'fullName', type: 'string', description: 'Optional. Shown to the cashier and on receipts.' },
    ],
    requestExample: { phone: '+971509876543', fullName: 'Maya Khoury' },
    response: [
      { name: 'memberToken', type: 'string', description: 'Token for this customer, valid for 10 minutes.' },
      { name: 'created', type: 'boolean', description: '`true` when a new membership was created, `false` when the number already existed.' },
    ],
    responseExample: { memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', created: true },
    errors: [
      { status: 400, code: 'validation_error', when: '`phone must be E.164 (+9715xxxxxxxx)`.' },
      AUTH_ERROR,
    ],
  },
  {
    slug: 'member-context',
    method: 'POST',
    path: '/terminal/members/context',
    title: 'Get member context',
    group: 'Members',
    summary: 'Everything the cashier should see: name, loyalty id, tier, balances and stamp-card progress.',
    description: [
      'Balances are decimal strings because they are 64-bit integers. `available` is what can be spent now; `pending` is held by open redemptions; `lifetime` is all points ever earned.',
      '`challenges` is worth surfacing. “Two more visits and your next coffee is free” is the single most effective thing a cashier can say, and this is the only moment they have the customer in front of them. A brand with no challenges returns an empty list.',
    ],
    request: [{ name: 'memberToken', type: 'string', required: true, description: 'From resolve or enrol.' }],
    requestExample: { memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
    response: [
      { name: 'displayName', type: 'string', description: 'Customer name, or `Member` when unknown.' },
      { name: 'loyaltyId', type: 'string', description: 'Human-readable member id, e.g. `PP-4X7K2M`.' },
      { name: 'tier', type: 'string | null', description: 'Current tier name, if the brand runs tiers.' },
      { name: 'balance.available', type: 'string', description: 'Spendable points.' },
      { name: 'balance.active', type: 'string', description: 'Same as `available`. Kept for compatibility.' },
      { name: 'balance.pending', type: 'string', description: 'Points held by authorized, uncaptured redemptions.' },
      { name: 'balance.lifetime', type: 'string', description: 'Total points ever earned.' },
      { name: 'joinedAt', type: 'string', description: 'ISO-8601 timestamp of enrolment.' },
      { name: 'challenges[].id', type: 'string', description: 'Challenge id.' },
      { name: 'challenges[].name', type: 'string', description: 'Challenge name, e.g. `Coffee card`.' },
      { name: 'challenges[].unit', type: '"visits" | "progress"', description: 'Say “8 of 10 visits” when `visits`.' },
      { name: 'challenges[].isStampCard', type: 'boolean', description: 'Render as a stamp card.' },
      { name: 'challenges[].progress', type: 'number', description: 'Current progress.' },
      { name: 'challenges[].target', type: 'number', description: 'Progress needed to complete.' },
      { name: 'challenges[].rewardName', type: 'string | null', description: 'What completing it earns.' },
      { name: 'challenges[].rewardPoints', type: 'number', description: 'Bonus points on completion, if any.' },
    ],
    responseExample: {
      displayName: 'Maya Khoury',
      loyaltyId: 'PP-4X7K2M',
      tier: 'Silver',
      balance: { active: '1150', available: '1150', pending: '0', lifetime: '4820' },
      joinedAt: '2026-02-14T09:12:00.000Z',
      challenges: [
        { id: '019fc6e0-…', name: 'Coffee card', unit: 'visits', isStampCard: true, progress: 8, target: 10, rewardName: 'Free coffee', rewardPoints: 0 },
      ],
    },
    errors: [...TOKEN_ERRORS, { status: 404, code: 'not_found', when: 'The membership behind the token no longer exists at this brand.' }, AUTH_ERROR],
  },
  {
    slug: 'member-vouchers',
    method: 'POST',
    path: '/terminal/members/vouchers',
    title: 'List usable rewards',
    group: 'Rewards',
    summary: 'The rewards this member can use right now, so the cashier can tap one instead of asking for a code.',
    description: [
      'Only rewards that are usable at this moment are returned: issued, not expired, not held by another sale in progress. Holds from abandoned sales are released before the list is built. At most 20 are returned, newest first.',
    ],
    request: [{ name: 'memberToken', type: 'string', required: true, description: 'From resolve or enrol.' }],
    requestExample: { memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
    response: [
      { name: '[].code', type: 'string', description: 'The voucher code to pass to Redeem a voucher.' },
      { name: '[].rewardName', type: 'string', description: 'What the customer gets.' },
      { name: '[].kind', type: 'string', description: 'Reward kind, e.g. `voucher`.' },
      { name: '[].discountMinor', type: 'number', description: 'Money value in minor units, `0` when the reward is not a discount.' },
      { name: '[].expiresAt', type: 'string | null', description: 'ISO-8601 expiry, or `null` when it never expires.' },
    ],
    responseExample: [{ code: '7QX4M2', rewardName: 'Free coffee', kind: 'voucher', discountMinor: 1800, expiresAt: '2026-09-01T00:00:00.000Z' }],
    responseNote: 'The response body is a JSON array.',
    errors: [...TOKEN_ERRORS, AUTH_ERROR],
  },
  {
    slug: 'quote',
    method: 'POST',
    path: '/terminal/quotes',
    title: 'Quote a sale',
    group: 'Sales',
    summary: 'Preview the points a sale will award and what a redemption is worth. Changes nothing.',
    description: [
      'Optional, but the only way to show the customer a figure before charging. A quote can go stale, since an hour can end between quoting and charging; the transaction response is authoritative.',
      'Show `bonuses` to the customer. A doubled figure with nothing beside it looks identical to a promotion that failed to run.',
      'Send `items` when the brand runs product-specific earn rules. Each item is a SKU and a quantity; rules that target SKUs are evaluated against it.',
    ],
    request: [
      { name: 'memberToken', type: 'string', required: true, description: 'From resolve or enrol.' },
      { name: 'amountMinor', type: 'integer', description: 'Sale total in minor units. `2450` is AED 24.50.' },
      { name: 'items', type: '{ sku: string, qty: integer }[]', description: 'Line items, for SKU-targeted earn rules.' },
      { name: 'isVisit', type: 'boolean', description: '`true` counts this sale as a visit for stamp cards and visit-based rules.' },
      { name: 'redeemPoints', type: 'integer ≥ 1', description: 'Points the customer wants to spend. When present, `redeem` is included in the response.' },
    ],
    requestExample: { memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', amountMinor: 2450, isVisit: true, redeemPoints: 500 },
    response: [
      { name: 'earn.points', type: 'number', description: 'Points this sale would award.' },
      { name: 'earn.base', type: 'number', description: 'Points before multipliers and bonuses.' },
      { name: 'earn.multiplier', type: 'number', description: 'Combined multiplier applied, `1` when none.' },
      { name: 'earn.bonuses[].id', type: 'string', description: 'Rule id.' },
      { name: 'earn.bonuses[].name', type: 'string', description: 'Rule name to show the customer, e.g. `Happy Hour`.' },
      { name: 'earn.bonuses[].factor', type: 'number', description: 'Present for multipliers: `2` for double points.' },
      { name: 'earn.bonuses[].points', type: 'number', description: 'Present for flat bonuses: extra points added.' },
      { name: 'redeem.points', type: 'number', description: 'The `redeemPoints` you asked about. Only present when you sent it.' },
      { name: 'redeem.affordable', type: 'boolean', description: 'Whether the member’s available balance covers it.' },
      { name: 'redeem.valueMinor', type: 'string', description: 'Discount those points are worth on this bill, after rounding and the bill cap.' },
      { name: 'redeem.belowMinimum', type: 'boolean', description: '`true` when below `redemption.minRedeemPoints` from configuration.' },
    ],
    responseExample: {
      earn: { points: 48, base: 24, multiplier: 2, bonuses: [{ id: '019fc6f1-…', name: 'Happy Hour', factor: 2 }] },
      redeem: { points: 500, affordable: true, valueMinor: '500', belowMinimum: false },
    },
    errors: [...TOKEN_ERRORS, AUTH_ERROR],
  },
  {
    slug: 'create-transaction',
    method: 'POST',
    path: '/terminal/transactions',
    title: 'Create a transaction',
    group: 'Sales',
    summary: 'Award points for a sale (earn), or place a hold on points the customer is spending (redeem). Idempotent.',
    description: [
      '**Earn** is one step: the points are posted immediately and the response includes everything worth celebrating on the receipt. Posting an earn also confirms any reward voucher held for this member, because the sale has completed.',
      '**Redeem** is the first half of two: the points are held and the customer’s available balance drops, but nothing is spent until you call Capture. Call Void if the sale does not complete.',
      'Generate one `idempotencyKey` per sale and reuse it on every retry. A repeat with the same key returns the original transaction and awards nothing further. Keys are scoped to your terminal.',
    ],
    request: [
      { name: 'intent', type: '"earn" | "redeem"', required: true, description: 'Award points, or hold points to spend.' },
      { name: 'memberToken', type: 'string', required: true, description: 'From resolve or enrol.' },
      { name: 'idempotencyKey', type: 'string', required: true, description: 'One UUID per sale, generated when the sale happens. Reused on retry.' },
      { name: 'amountMinor', type: 'integer', description: 'Sale total in minor units. Used for earn.' },
      { name: 'items', type: '{ sku: string, qty: integer }[]', description: 'Line items, for SKU-targeted earn rules.' },
      { name: 'isVisit', type: 'boolean', description: '`true` counts this sale as a visit.' },
      { name: 'points', type: 'integer ≥ 1', description: 'Points to hold. Required when `intent` is `redeem`.' },
      { name: 'sourceEvent', type: 'string', description: 'Your order or bill reference, stored with the transaction.' },
    ],
    requestExample: {
      intent: 'earn',
      memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
      idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      amountMinor: 2450,
      isVisit: true,
      sourceEvent: 'ORDER-10482',
    },
    response: [
      ...TXN_FIELDS,
      { name: 'completed[]', type: 'object[]', description: 'Earn only. Challenges and stamp cards this sale completed: `{ id, name, kind, rewardPoints, badgeName?, rewardName?, voucherCode? }`. Print `badgeName` and say the reward out loud.' },
      { name: 'stamps[]', type: 'object[]', description: 'Earn only. Repeating visit cards and where they stand: `{ id, name, progress, target, completions, justCompleted? }`.' },
      { name: 'bonuses[]', type: 'object[]', description: 'Earn only. Rules that made this bigger than usual: `{ id, name, factor?, points? }`. Name them on the receipt.' },
    ],
    responseExample: {
      id: '019fc6f5-3a4b-7c5d-8e6f-7a8b9c0d1e2f',
      intent: 'earn',
      state: 'captured',
      points: '48',
      amountMinor: '2450',
      authJournalId: null,
      captureJournalId: '019fc6f5-4b5c-7d6e-9f7a-8b9c0d1e2f3a',
      completed: [
        { id: '019fc6e0-…', name: 'Coffee card', kind: 'visits', rewardPoints: '0', badgeName: 'Free coffee · CODE 7QX4M2', rewardName: 'Free coffee', voucherCode: '7QX4M2' },
      ],
      stamps: [{ id: '019fc6e0-…', name: 'Coffee card', progress: 10, target: 10, completions: 1, justCompleted: true }],
      bonuses: [{ id: '019fc6f1-…', name: 'Happy Hour', factor: 2 }],
    },
    responseNote:
      'A redeem returns the seven transaction fields only, with `state: "authorized"`. A replay with a previously used idempotency key returns the seven transaction fields of the original, without `completed`, `stamps` or `bonuses`.',
    errors: [
      { status: 400, code: 'validation_error', when: '`insufficient points` — the member cannot cover this redemption.' },
      { status: 400, code: 'validation_error', when: '`redeem requires points > 0`.' },
      ...TOKEN_ERRORS,
      AUTH_ERROR,
    ],
    notes: ['If you do not get a response, retry with the same `idempotencyKey`. Never generate a new one for a retry.'],
  },
  {
    slug: 'capture-transaction',
    method: 'POST',
    path: '/terminal/transactions/{id}/capture',
    title: 'Capture a redemption',
    group: 'Sales',
    summary: 'The card payment succeeded: spend the held points.',
    description: [
      'Only valid from `authorized`; any other state returns a `400` naming the current state. Capture also confirms any reward voucher held for this member, since the sale has completed.',
      'No request body. Capture is safe to retry: a second call on an already captured transaction returns `400 cannot capture in state captured`, which you can treat as success after checking the transaction.',
    ],
    pathParams: [{ name: 'id', type: 'string', required: true, description: 'Transaction id from Create a transaction.' }],
    response: TXN_FIELDS,
    responseExample: { ...TXN_EXAMPLE_REDEEM, state: 'captured', captureJournalId: '019fc7a3-1c2d-7e3f-8a4b-5c6d7e8f9a0b' },
    errors: [
      { status: 400, code: 'validation_error', when: '`cannot capture in state <state>` — the transaction is not `authorized`.' },
      { status: 404, code: 'not_found', when: 'No such transaction for this brand.' },
      AUTH_ERROR,
    ],
  },
  {
    slug: 'void-transaction',
    method: 'POST',
    path: '/terminal/transactions/{id}/void',
    title: 'Void a redemption',
    group: 'Sales',
    summary: 'The sale did not complete: release the held points and any reward held for it.',
    description: [
      'Only valid from `authorized`. Points return to the customer’s available balance immediately, and any reward voucher held for this member is handed back rather than waiting out its hold.',
      'Void is the correct call whenever the sale does not complete, including when your own process crashed and you found the hold on restart. An authorization left open holds the customer’s points.',
    ],
    pathParams: [{ name: 'id', type: 'string', required: true, description: 'Transaction id from Create a transaction.' }],
    response: TXN_FIELDS,
    responseExample: { ...TXN_EXAMPLE_REDEEM, state: 'voided' },
    errors: [
      { status: 400, code: 'validation_error', when: '`cannot void in state <state>` — the transaction is not `authorized`.' },
      { status: 404, code: 'not_found', when: 'No such transaction for this brand.' },
      AUTH_ERROR,
    ],
  },
  {
    slug: 'get-transaction',
    method: 'GET',
    path: '/terminal/transactions/{id}',
    title: 'Get a transaction',
    group: 'Sales',
    summary: 'The definitive state of a transaction. Use it after a timeout rather than guessing.',
    description: [
      'When a create, capture or void call times out, poll this before deciding what to do. If the state is `authorized`, capture or void it. If it is `captured`, the sale is done.',
    ],
    pathParams: [{ name: 'id', type: 'string', required: true, description: 'Transaction id.' }],
    response: TXN_FIELDS,
    responseExample: TXN_EXAMPLE_REDEEM,
    errors: [{ status: 404, code: 'not_found', when: 'No such transaction for this brand.' }, AUTH_ERROR],
  },
  {
    slug: 'batch-transactions',
    method: 'POST',
    path: '/terminal/transactions/batch',
    title: 'Replay a batch',
    group: 'Sales',
    summary: 'Replay up to 200 queued transactions from an outage in one call. Each is deduplicated by its idempotency key.',
    description: [
      'Each operation is a full Create a transaction body and is processed independently. The call succeeds even when individual operations fail, so **inspect every element**: a failed element stays your responsibility.',
      'Member tokens expire after 10 minutes, so a token captured offline is usually dead by replay time. Queue the identifier (phone or scanned code), resolve it fresh at replay, and substitute the new token.',
      'Redemptions should not be queued. Points you cannot verify are points the customer may not have; take payment in full and let them redeem next visit.',
    ],
    request: [{ name: 'operations', type: 'Transaction[]', required: true, description: 'Up to 200 bodies as accepted by Create a transaction. Each needs its own `idempotencyKey`.' }],
    requestExample: {
      operations: [
        { intent: 'earn', memberToken: 'eyJ…', idempotencyKey: '4f6a1c2e-…', amountMinor: 2450, isVisit: true },
        { intent: 'earn', memberToken: 'eyJ…', idempotencyKey: '9b3d7e1f-…', amountMinor: 900, isVisit: true },
      ],
    },
    response: [
      { name: 'results[].idempotencyKey', type: 'string', description: 'The key of the operation this result belongs to.' },
      { name: 'results[].ok', type: 'boolean', description: 'Whether it was applied.' },
      { name: 'results[].result', type: 'Transaction', description: 'Present when `ok` is `true`: the same shape as Create a transaction.' },
      { name: 'results[].error', type: 'string', description: 'Present when `ok` is `false`: a message safe to log.' },
    ],
    responseExample: {
      results: [
        { idempotencyKey: '4f6a1c2e-…', ok: true, result: { id: '019fc6f5-…', intent: 'earn', state: 'captured', points: '48', amountMinor: '2450', authJournalId: null, captureJournalId: '019fc6f5-…', completed: [], stamps: [], bonuses: [] } },
        { idempotencyKey: '9b3d7e1f-…', ok: false, error: 'invalid or expired member token' },
      ],
    },
    errors: [{ status: 400, code: 'validation_error', when: 'More than 200 operations, or a malformed operation body.' }, AUTH_ERROR],
  },
  {
    slug: 'redeem-voucher',
    method: 'POST',
    path: '/terminal/vouchers/redeem',
    title: 'Redeem a voucher',
    group: 'Rewards',
    summary: 'Apply a reward to the sale in progress. The reward is held, and spent when the sale completes.',
    description: [
      'Codes are case-insensitive. Passing `memberToken` is optional but recommended: it makes us verify the voucher belongs to the customer in front of you.',
      '`reserved` is a hold, not a spend. It is confirmed when the sale completes, by an earn or a capture, and released automatically if the sale is abandoned, after 15 minutes at the latest. Apply `discountMinor` to the bill yourself; we do not price your cart.',
      'One reward per sale. A second redemption while another is held returns a `400` naming the reward already applied.',
    ],
    request: [
      { name: 'code', type: 'string', required: true, description: 'The voucher code from the customer’s app, a printed slip, or List usable rewards.' },
      { name: 'memberToken', type: 'string', description: 'Verify the voucher belongs to this member.' },
    ],
    requestExample: { code: '7QX4M2', memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
    response: [
      { name: 'code', type: 'string', description: 'The code, normalised to upper case.' },
      { name: 'status', type: '"reserved"', description: 'Held for this sale.' },
      { name: 'rewardName', type: 'string', description: 'What to hand over.' },
      { name: 'kind', type: 'string', description: 'Reward kind, e.g. `voucher`.' },
      { name: 'discountMinor', type: 'number', description: 'Discount to apply to the bill, in minor units. `0` for non-discount rewards.' },
    ],
    responseExample: { code: '7QX4M2', status: 'reserved', rewardName: 'Free coffee', kind: 'voucher', discountMinor: 1800 },
    errors: [
      { status: 404, code: 'not_found', when: 'No such voucher for this brand.' },
      { status: 400, code: 'validation_error', when: '`This voucher has expired`.' },
      { status: 400, code: 'validation_error', when: '`This voucher was already used`.' },
      { status: 400, code: 'validation_error', when: '`This voucher was already used on a sale in progress`.' },
      { status: 400, code: 'validation_error', when: '`This voucher belongs to a different member`.' },
      { status: 400, code: 'validation_error', when: '`Only one reward can be used per sale — <reward> is already applied`.' },
      ...TOKEN_ERRORS,
      AUTH_ERROR,
    ],
    notes: ['Every `400` message on this endpoint is written to be shown to the cashier as-is.'],
  },
  {
    slug: 'create-receipt',
    method: 'POST',
    path: '/terminal/receipts',
    title: 'Create a receipt',
    group: 'Receipts',
    summary: 'Store a digital copy of the sale behind the QR code you print. Idempotent by token.',
    description: [
      'Generate `token` **before** you print, so the printed QR is valid even if this call is queued and replayed later. The customer-facing page is `https://api.partnerspoints.ae/v1/r/<token>`; that is what the QR should encode.',
      'Passing `memberToken` lets us attach the rewards used and any stamp card completed to the digital receipt, and email it when we hold an address, so it matches the paper one.',
    ],
    request: [
      { name: 'token', type: 'string', required: true, description: 'Your unguessable receipt token (a UUID). The QR encodes it.' },
      { name: 'orderNo', type: 'string', required: true, description: 'Your order or bill number.' },
      { name: 'kind', type: '"sale" | "refund" | "void"', description: 'Defaults to `sale`.' },
      { name: 'grossMinor', type: 'integer ≥ 0', description: 'Total before discounts.' },
      { name: 'discountMinor', type: 'integer ≥ 0', description: 'Discount applied, including any reward.' },
      { name: 'netMinor', type: 'integer ≥ 0', description: 'Amount charged.' },
      { name: 'currency', type: 'string', description: 'ISO-4217. Defaults to `AED`.' },
      { name: 'paymentMethod', type: 'string', description: 'e.g. `card`, `cash`. Defaults to `card`.' },
      { name: 'maskedPan', type: 'string', description: 'e.g. `•••• 4242`.' },
      { name: 'authNo', type: 'string', description: 'Card authorisation code.' },
      { name: 'memberName', type: 'string', description: 'As printed.' },
      { name: 'earnedPoints', type: 'integer ≥ 0', description: 'Points awarded on this sale.' },
      { name: 'redeemedPoints', type: 'integer ≥ 0', description: 'Points spent on this sale.' },
      { name: 'balanceAfter', type: 'integer ≥ 0', description: 'Balance after the sale.' },
      { name: 'pointsCode', type: 'string', description: 'The brand’s points name from configuration.' },
      { name: 'memberToken', type: 'string', description: 'Attaches rewards and completed cards to the receipt.' },
      { name: 'bonuses', type: '{ name, factor?, points? }[]', description: 'Echo `bonuses` from the transaction response so a happy hour is explained on the receipt.' },
    ],
    requestExample: {
      token: '2d1c9a3e-5f4b-4a8c-9d7e-1b2c3d4e5f6a',
      kind: 'sale',
      orderNo: 'ORDER-10482',
      grossMinor: 2450,
      discountMinor: 500,
      netMinor: 1950,
      currency: 'AED',
      paymentMethod: 'card',
      maskedPan: '•••• 4242',
      authNo: '004821',
      memberName: 'Maya Khoury',
      earnedPoints: 48,
      redeemedPoints: 500,
      balanceAfter: 698,
      pointsCode: 'BEANS',
      memberToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
      bonuses: [{ name: 'Happy Hour', factor: 2 }],
    },
    response: [
      { name: 'id', type: 'string', description: 'Receipt id.' },
      { name: 'token', type: 'string', description: 'The token you sent. Same response on replay.' },
    ],
    responseExample: { id: '019fc700-1a2b-7c3d-8e4f-5a6b7c8d9e0f', token: '2d1c9a3e-5f4b-4a8c-9d7e-1b2c3d4e5f6a' },
    errors: [{ status: 400, code: 'validation_error', when: 'A money or points field is negative or not an integer.' }, ...TOKEN_ERRORS, AUTH_ERROR],
  },
];

export const ENDPOINT_GROUPS = ['Diagnostics', 'Configuration', 'Members', 'Sales', 'Rewards', 'Receipts'] as const;

export function endpointBySlug(slug: string): Endpoint | undefined {
  return ENDPOINTS.find((e) => e.slug === slug);
}
