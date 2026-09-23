import Image from 'next/image';
import type { Metadata } from 'next';
import { safeNextPath } from '../../lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const failed = params.error === '1';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <Image src="/brand/mark.png" alt="Partners Points" width={56} height={56} className="rounded-2xl shadow-sm" priority />
          <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-ink">Partners Points Developers</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/55">
            Partner documentation for the POS integration API. Enter the access code you were given.
          </p>
        </div>

        <form action="/api/access" method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">Access code</span>
            <input
              name="code"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-[15px] text-ink outline-none transition-shadow placeholder:text-ink/30 focus:border-brand focus:ring-4 focus:ring-brand/10"
              placeholder="••••••••••••"
            />
          </label>
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              That code is not valid. Check for stray spaces, or ask your Partners Points contact for a new one.
            </p>
          ) : null}
          <button
            type="submit"
            className="h-12 w-full rounded-xl bg-ink text-[15px] font-semibold text-white transition-colors hover:bg-ink-muted focus:outline-none focus:ring-4 focus:ring-ink/15"
          >
            Continue
          </button>
        </form>

        <p className="mt-10 text-center text-xs leading-relaxed text-ink/40">
          Confidential. Access codes are issued per partner by RFM Loyalty and can be revoked at any time.
        </p>
      </div>
    </div>
  );
}
