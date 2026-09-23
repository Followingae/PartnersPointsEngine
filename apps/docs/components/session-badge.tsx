'use client';

import { useEffect, useState } from 'react';
import { LABEL_COOKIE } from '../lib/session-label';

/**
 * Shows who is signed in. Reads the non-secret label cookie on the client so
 * every page can stay statically generated; the real session cookie is
 * HttpOnly and only the middleware ever sees it.
 */
export function SessionBadge() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LABEL_COOKIE}=([^;]*)`));
    setLabel(m ? decodeURIComponent(m[1]!) : null);
  }, []);

  if (!label) return null;
  return (
    <form action="/api/logout" method="post" className="hidden items-center gap-3 border-l border-border pl-4 sm:flex">
      <span className="text-xs text-ink/50">
        Signed in · <span className="font-medium text-ink/80">{label}</span>
      </span>
      <button type="submit" className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
        Sign out
      </button>
    </form>
  );
}
