/**
 * HTTP smoke/e2e test — runs against a STARTED server (compiled), exercising the
 * full request pipeline (guards, ValidationPipe, error envelope) that the
 * service-level unit/integration tests bypass. Used in CI after `node dist/main.js`.
 *
 *   SMOKE_BASE_URL=http://localhost:3001 node scripts/smoke.mjs
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001';
const EMAIL = process.env.SMOKE_EMAIL ?? 'admin@camel-bean.dev';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'ChangeMe123!';

let failures = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures += 1;
};
const json = async (res) => {
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};

const health = await fetch(`${BASE}/health`).then(json);
check('GET /health → ok', health?.status === 'ok');

const loginRes = await fetch(`${BASE}/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const login = await json(loginRes);
check('POST /v1/auth/login → 200', loginRes.status === 200);
check('login returns an accessToken (DTO validation works)', typeof login?.accessToken === 'string' && login.accessToken.length > 20);
const token = login?.accessToken ?? '';

const sumRes = await fetch(`${BASE}/v1/manage/reports/summary`, { headers: { Authorization: `Bearer ${token}` } });
const summary = await json(sumRes);
check('GET /v1/manage/reports/summary → 200', sumRes.status === 200);
check('summary has pointsLiability', typeof summary?.pointsLiability === 'string');

const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// Lists now return { rows, total } (paginated/searchable).
const rewardsList = await fetch(`${BASE}/v1/manage/rewards?limit=5`, { headers: auth }).then(json);
check('GET /v1/manage/rewards → { rows, total }', Array.isArray(rewardsList?.rows) && typeof rewardsList?.total === 'number');

// Full CRUD round-trip: create → PATCH → clone → DELETE(archive).
const created = await fetch(`${BASE}/v1/manage/rewards`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'SMOKE reward', pointsCost: 123, kind: 'voucher' }) }).then(json);
check('POST reward → id', typeof created?.id === 'string');
const patched = await fetch(`${BASE}/v1/manage/rewards/${created?.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ pointsCost: 321 }) }).then(json);
check('PATCH reward → updated cost', patched?.pointsCost === '321');
const cloneRes = await fetch(`${BASE}/v1/manage/rewards/${created?.id}/clone`, { method: 'POST', headers: auth });
check('POST reward/:id/clone → 201', cloneRes.status === 201 || cloneRes.status === 200);
const delRes = await fetch(`${BASE}/v1/manage/rewards/${created?.id}`, { method: 'DELETE', headers: auth });
check('DELETE reward → 200', delRes.status === 200);

// Audit trail is populated by mutations.
const audit = await fetch(`${BASE}/v1/manage/audit-logs?limit=5`, { headers: auth }).then(json);
check('GET /v1/manage/audit-logs → has entries', Array.isArray(audit?.rows) && audit.total > 0);

// Customer 360 for the first member (if any).
const members = await fetch(`${BASE}/v1/manage/members?limit=1`, { headers: auth }).then(json);
if (members?.rows?.[0]) {
  const profile = await fetch(`${BASE}/v1/manage/customers/${members.rows[0].membershipId}/profile`, { headers: auth }).then(json);
  check('GET customer 360 → balance', typeof profile?.balance?.available === 'string');
}

// Brand settings round-trip.
const settings = await fetch(`${BASE}/v1/manage/settings`, { headers: auth }).then(json);
check('GET /v1/manage/settings → brand', typeof settings?.id === 'string');

// Negative: missing token → 401 with the shared error envelope.
const noAuthRes = await fetch(`${BASE}/v1/manage/reports/summary`);
const noAuth = await json(noAuthRes);
check('unauthorized → 401', noAuthRes.status === 401);
check('error envelope shape { error: { code } }', noAuth?.error?.code === 'unauthorized');

// Negative: malformed login body → 4xx (not a 500).
const badRes = await fetch(`${BASE}/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'not-an-email' }),
});
check('malformed login → 4xx (validation, not 500)', badRes.status >= 400 && badRes.status < 500);

if (failures > 0) {
  console.error(`\nSMOKE FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nSMOKE PASSED ✅');
