import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/auth';

/**
 * Everything on the portal is gated except the sign-in page, its POST target,
 * static assets, and the `/brand` + `/email` folders, which hold the logo and
 * the images referenced by onboarding emails (those must render without a
 * session, otherwise the email arrives with broken pictures).
 */
export const config = {
  matcher: ['/((?!_next/|brand/|email/|favicon\\.ico|icon\\.png|robots\\.txt|access$|api/access$).*)'],
};

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  }
  const url = req.nextUrl.clone();
  const next = url.pathname + (url.search || '');
  url.pathname = '/access';
  url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return NextResponse.redirect(url);
}
