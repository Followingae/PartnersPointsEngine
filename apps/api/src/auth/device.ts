import type { Request } from 'express';

/**
 * What we record about the device a session was opened from.
 *
 * Only enough to let someone recognise their own phone in a list and sign a
 * stranger's out — the raw user-agent, capped, and the address the request
 * arrived from. Nothing is derived from it server-side; the app does the
 * naming, so a new device string never needs a deploy to read sensibly.
 */
export interface DeviceInfo {
  userAgent: string | null;
  ip: string | null;
}

/** Long enough for any real UA; short enough that nobody can stuff the column. */
const MAX_UA = 400;

export function deviceOf(req: Request): DeviceInfo {
  const ua = req.headers['user-agent'];
  // `req.ip` honours the trust-proxy setting; the socket address is the fallback
  // for the direct-connection case.
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  return {
    userAgent: typeof ua === 'string' && ua.trim() ? ua.trim().slice(0, MAX_UA) : null,
    ip: ip ?? null,
  };
}
