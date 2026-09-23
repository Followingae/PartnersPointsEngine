import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '../../../lib/auth';
import { LABEL_COOKIE } from '../../../lib/session-label';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/access';
  url.search = '';
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(LABEL_COOKIE, '', { httpOnly: false, path: '/', maxAge: 0 });
  return res;
}
