'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, MoreVertical, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('rounded-3xl border border-border/70 bg-card shadow-card', className)}>
      {children}
    </div>
  );
}

const GRADS: Record<string, string> = {
  lime: 'bg-gradient-lime text-ink',
  coral: 'bg-gradient-coral text-ink',
  teal: 'bg-gradient-teal text-ink',
  ink: 'bg-gradient-ink text-white',
};

export function StatHero({
  label,
  value,
  unit,
  delta,
  gradient = 'lime',
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  gradient?: keyof typeof GRADS | string;
  icon?: ReactNode;
}) {
  return (
    <div className={clsx('relative overflow-hidden rounded-3xl p-5 shadow-hero', GRADS[gradient] ?? GRADS.lime)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-80">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10">{icon}</span>
      </div>
      <div className="mt-6 flex items-end gap-2">
        <span className="font-display text-[2.75rem] font-bold leading-none tracking-tight">{value}</span>
        {unit ? <span className="mb-1 text-sm font-semibold opacity-70">{unit}</span> : null}
      </div>
      {delta ? (
        <span className="mt-3 inline-flex items-center rounded-full bg-black/15 px-2.5 py-1 text-xs font-semibold">
          {delta}
        </span>
      ) : null}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'lime' | 'coral' | 'teal' | 'ink' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-muted text-muted-foreground',
    lime: 'bg-lime-200 text-lime-900',
    coral: 'bg-coral/20 text-[#9b3b52]',
    teal: 'bg-teal/20 text-[#0f6b66]',
    ink: 'bg-ink text-white',
  };
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-display text-lg font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  );
}

/** Slide-over panel anchored to the right — used for detail / 360 views. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; width?: 'md' | 'lg' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div className={clsx('flex h-full w-full flex-col bg-card shadow-hero', width === 'lg' ? 'max-w-2xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border/70 px-6 py-5">
          <div>
            {subtitle ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{subtitle}</p> : null}
            <h2 className="mt-0.5 font-display text-2xl font-bold tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-border/70 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon ? <span className="grid h-14 w-14 place-items-center rounded-3xl bg-muted text-muted-foreground">{icon}</span> : null}
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-muted', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 p-1">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-9', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-input bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30 sm:w-72"
      />
    </div>
  );
}

export function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>
        {from}–{to} of <span className="font-semibold text-foreground">{total}</span>
      </span>
      <div className="flex gap-1.5">
        <button
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-white transition hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-white transition hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** Kebab dropdown of row actions. Rendered in a portal so it never clips under
    `overflow-hidden` table/card containers; flips above when near the viewport edge. */
export function ActionMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const WIDTH = 172;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const estH = actions.length * 40 + 8;
      const top = r.bottom + 6 + estH > window.innerHeight ? Math.max(8, r.top - estH - 6) : r.bottom + 6;
      setCoords({ top, left: Math.max(8, r.right - WIDTH) });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted">
        <MoreVertical size={16} />
      </button>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[200] overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-hero"
              style={{ top: coords.top, left: coords.left, width: WIDTH }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {actions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => { setOpen(false); a.onClick(); }}
                  className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted', a.danger && 'text-destructive')}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Sortable table header cell. */
export function Th({ children, sortKey, sort, order, onSort, className }: { children: ReactNode; sortKey?: string; sort?: string; order?: 'asc' | 'desc'; onSort?: (key: string) => void; className?: string }) {
  const active = sortKey && sort === sortKey;
  return (
    <th className={clsx('px-4 py-3 font-semibold', className)}>
      {sortKey && onSort ? (
        <button onClick={() => onSort(sortKey)} className={clsx('inline-flex items-center gap-1 transition hover:text-foreground', active ? 'text-foreground' : '')}>
          {children}
          {active ? <span className="text-[10px]">{order === 'asc' ? '▲' : '▼'}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
