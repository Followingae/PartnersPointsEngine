import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '../../components/nav-links';
import { SessionBadge } from '../../components/session-badge';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Partners Points Developers">
            <Image src="/brand/mark.png" alt="" width={28} height={28} className="rounded-lg" priority />
            <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
              Partners Points <span className="text-ink/40">Developers</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <NavLinks />
            <SessionBadge />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-10 text-sm text-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RFM Loyalty · Partners Points. Confidential, shared with integration partners under agreement.</p>
          <p>
            Integration support:{' '}
            <a href="mailto:help@partnerspoints.ae" className="font-medium text-ink/70 hover:text-ink">
              help@partnerspoints.ae
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
