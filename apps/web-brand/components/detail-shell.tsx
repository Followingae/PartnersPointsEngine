'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
      <ArrowLeft size={15} /> {label}
    </Link>
  );
}

/** Full-page detail header: eyebrow + big title + optional badge + right-aligned actions. */
export function DetailHeader({ subtitle, title, badge, actions }: { subtitle?: string; title: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {subtitle ? <p className="text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {badge}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export interface TabDef {
  key: string;
  label: string;
  count?: number;
}

/** Horizontal sub-navigation for a detail page (controlled). */
export function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border/70">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition ${active === t.key ? 'border-b-2 border-ink text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
