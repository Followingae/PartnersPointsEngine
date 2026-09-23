import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SessionBadge } from '../../components/session-badge';
import { Sidebar } from '../../components/sidebar';
import { NAV } from '../../content/nav';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-white">
        <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Partners Points Developers">
            <Image src="/brand/mark.png" alt="" width={24} height={24} className="rounded-md" priority />
            <span className="font-display text-[0.98rem] font-semibold tracking-tight text-ink">Partners Points</span>
            <span className="ml-1 rounded-md border border-border px-1.5 py-[1px] text-[0.68rem] font-medium uppercase tracking-wider text-ink/50">
              Docs
            </span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <a href="/openapi.json" className="hidden font-medium text-ink/70 hover:text-ink sm:inline" target="_blank" rel="noreferrer">
              OpenAPI 3
            </a>
            <a href="mailto:help@partnerspoints.ae" className="hidden font-medium text-ink/70 hover:text-ink sm:inline">
              Support
            </a>
            <SessionBadge />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] px-5">
        <aside className="hidden w-[248px] shrink-0 border-r border-border lg:block">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-5">
            <Sidebar groups={NAV} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-8 text-xs text-ink/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RFM Loyalty · Partners Points. Confidential, shared with integration partners under agreement.</p>
          <p>API version 1 · Base URL https://api.partnerspoints.ae/v1</p>
        </div>
      </footer>
    </div>
  );
}
