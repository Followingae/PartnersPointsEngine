/**
 * Portal access: partner access codes → signed, expiring session cookie.
 *
 * Runs in the Edge middleware as well as in route handlers, so it uses only
 * Web Crypto (no `node:crypto`). Codes are configured per partner
 * (`DOCS_ACCESS_CODES=till=…,acme=…`) so one partner can be revoked by
 * removing its entry: every session carries the partner label, and a label
 * that no longer exists fails verification on the next request.
 */

export const SESSION_COOKIE = 'pp_dev_session';
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

export type AccessCode = { label: string; code: string };

/** Parse `label=code,label=code`; a bare `DOCS_PASSWORD` becomes label `default`. */
export function accessCodes(): AccessCode[] {
  const raw = process.env.DOCS_ACCESS_CODES ?? '';
  const out: AccessCode[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const label = trimmed.slice(0, eq).trim().toLowerCase();
    const code = trimmed.slice(eq + 1).trim();
    if (/^[a-z0-9-]{1,32}$/.test(label) && code.length >= 8) out.push({ label, code });
  }
  const legacy = process.env.DOCS_PASSWORD?.trim();
  if (legacy && legacy.length >= 8) out.push({ label: 'default', code: legacy });
  return out;
}

function signingSecret(): string {
  const explicit = process.env.DOCS_COOKIE_SECRET?.trim();
  if (explicit) return explicit;
  // Derived fallback: changes whenever any code changes, which is acceptable
  // (everyone signs in again) and never leaves the portal unsigned.
  return 'derived:' + accessCodes().map((c) => `${c.label}=${c.code}`).join('|');
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(signingSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

function b64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant-time equality on fixed-length digests, so timing never leaks a prefix. */
async function equalDigest(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!;
  return diff === 0;
}

/** Returns the partner label the code belongs to, or null. Checks every code, always. */
export async function matchAccessCode(input: string): Promise<string | null> {
  let matched: string | null = null;
  for (const { label, code } of accessCodes()) {
    if (await equalDigest(input, code)) matched = matched ?? label;
  }
  return matched;
}

export async function issueSession(label: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `v1.${label}.${exp}`;
  return `${payload}.${await sign(payload)}`;
}

export type Session = { label: string; expiresAt: number };

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, label, expRaw, sig] = parts as [string, string, string, string];
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (!accessCodes().some((c) => c.label === label)) return null; // revoked partner
  const expected = await sign(`v1.${label}.${exp}`);
  if (!(await equalDigest(sig, expected))) return null;
  return { label, expiresAt: exp };
}

/** Only ever redirect back to a same-origin path. */
export function safeNextPath(input: string | null | undefined): string {
  if (!input || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) return '/';
  if (input.startsWith('/access') || input.startsWith('/api/')) return '/';
  return input;
}
