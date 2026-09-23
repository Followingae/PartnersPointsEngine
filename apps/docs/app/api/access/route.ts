import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, issueSession, matchAccessCode, safeNextPath } from '../../../lib/auth';
import { LABEL_COOKIE } from '../../../lib/session-label';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const code = String(form.get('code') ?? '').trim();
  const next = safeNextPath(String(form.get('next') ?? '/'));

  const label = code ? await matchAccessCode(code) : null;
  if (!label) {
    // A small fixed delay makes brute force impractical without needing state.
    await new Promise((r) => setTimeout(r, 600));
    const url = req.nextUrl.clone();
    url.pathname = '/access';
    url.search = `?error=1${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`;
    return NextResponse.redirect(url, { status: 303 });
  }

  const url = req.nextUrl.clone();
  url.pathname = next;
  url.search = '';
  const res = NextResponse.redirect(url, { status: 303 });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(SESSION_COOKIE, await issueSession(label), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  // Display-only twin of the session: the partner label, readable by the page.
  res.cookies.set(LABEL_COOKIE, label, { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400 });
  return res;
}
