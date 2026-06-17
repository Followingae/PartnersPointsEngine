'use client';

import { Building2, Search, Store, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { globalSearch, type SearchResults } from '@/lib/api';

/** Global command palette (Cmd/Ctrl+K, or the sidebar "Search" button which
    dispatches an `open-search` event). Searches merchants, brands, customers. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('open-search', onOpen);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('open-search', onOpen); };
  }, []);

  useEffect(() => { if (open) { setQ(''); setResults(null); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    const t = setTimeout(() => {
      globalSearch(q).then(setResults).catch(() => setResults(null)).finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  const go = (path: string) => { setOpen(false); router.push(path); };
  const empty = results && !results.groups.length && !results.brands.length && !results.customers.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-hero" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <Search size={18} className="text-muted-foreground" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchants, brands, customers…" className="w-full bg-transparent text-sm outline-none" />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least 2 characters…</p>
          ) : loading && !results ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : empty ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{q}”.</p>
          ) : (
            <>
              <Group label="Merchants" items={results?.groups ?? []} render={(g) => (
                <Row key={g.id} icon={<Building2 size={15} />} title={g.name} sub="Merchant" onClick={() => go(`/merchants/${g.id}`)} />
              )} />
              <Group label="Brands" items={results?.brands ?? []} render={(b) => (
                <Row key={b.id} icon={<Store size={15} />} title={b.name} sub="Brand" onClick={() => go(`/merchants/${b.groupId}`)} />
              )} />
              <Group label="Customers" items={results?.customers ?? []} render={(c) => (
                <Row key={c.membershipId} icon={<User size={15} />} title={c.name || c.loyaltyId} sub={`${c.brandName} · ${c.loyaltyId}`} onClick={() => go(`/brands`)} />
              )} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group<T>({ label, items, render }: { label: string; items: T[]; render: (item: T) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="mb-1">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.map(render)}
    </div>
  );
}

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-muted">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
