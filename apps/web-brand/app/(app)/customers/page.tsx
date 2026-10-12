'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Sparkles, UserPlus, Users } from 'lucide-react';
import { Badge, Card, EmptyState, Pagination, SearchInput, SectionTitle, StatHero, Th, TableSkeleton } from '@/components/ui';
import { Modal, PageHeader } from '@/components/form';
import { SegmentDonut } from '@/components/charts';
import { getCustomerDirectory, type CustomerDirectoryRow } from '@/lib/api';
import { MEANINGFUL_SAMPLE, segmentInfo } from '@/lib/rfm';

const fmt = (v: string | number) => Number(v).toLocaleString();
const PAGE = 12;

type SortKey = 'name' | 'available' | 'lifetime' | 'lastSeen' | 'joined';

function daysAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function CustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerDirectoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('lifetime');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [explaining, setExplaining] = useState<CustomerDirectoryRow | null>(null);

  useEffect(() => {
    getCustomerDirectory()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const all = rows ?? [];

  const stats = useMemo(() => {
    const now = Date.now();
    const active90 = all.filter((r) => r.lastActivityAt && now - new Date(r.lastActivityAt).getTime() < 90 * 86_400_000).length;
    const new30 = all.filter((r) => now - new Date(r.joinedAt).getTime() < 30 * 86_400_000).length;
    return { total: all.length, active90, new30 };
  }, [all]);

  const segmentData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) if (r.segment) counts.set(r.segment, (counts.get(r.segment) ?? 0) + 1);
    return [...counts.entries()].map(([segment, count]) => ({ segment, count })).sort((a, b) => b.count - a.count);
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? all.filter((r) => (r.fullName ?? '').toLowerCase().includes(needle) || r.loyaltyId.toLowerCase().includes(needle))
      : all.slice();
    const dir = order === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sort) {
        case 'name': return dir * (a.fullName ?? '~').localeCompare(b.fullName ?? '~');
        case 'available': return dir * (Number(a.available) - Number(b.available));
        case 'lifetime': return dir * (Number(a.lifetime) - Number(b.lifetime));
        case 'joined': return dir * (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
        case 'lastSeen': return dir * ((a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0) - (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0));
        default: return 0;
      }
    });
    return list;
  }, [all, q, sort, order]);

  const page = filtered.slice(offset, offset + PAGE);

  function onSort(key: string) {
    const k = key as SortKey;
    if (k === sort) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setOrder('desc'); }
    setOffset(0);
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Customers" />

      {error ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
        <StatHero label="Customers" value={fmt(stats.total)} gradient="ink" icon={<Users size={16} />} />
        <StatHero label="Active · 90 days" value={fmt(stats.active90)} gradient="lime" icon={<Activity size={16} />} />
        <StatHero label="New · 30 days" value={fmt(stats.new30)} gradient="teal" icon={<UserPlus size={16} />} />
        <Card className="p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles size={13} /> Segment mix
          </p>
          {segmentData.length ? (
            <SegmentDonut data={segmentData} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Segments appear once customers start earning.</p>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <SectionTitle
          action={
            <div className="flex items-center gap-3">
              <SearchInput value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search name or ID…" />
              <Badge tone="lime">{filtered.length}</Badge>
            </div>
          }
        >
          Customer directory
        </SectionTitle>

        {rows === null ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title={q ? 'No matches' : 'No customers yet'} hint={q ? 'Try a different name or loyalty ID.' : 'Members enrolled at the till will appear here.'} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <Th sortKey="name" sort={sort} order={order} onSort={onSort}>Customer</Th>
                    <Th>Tier</Th>
                    <Th sortKey="available" sort={sort} order={order} onSort={onSort}>Points</Th>
                    <Th sortKey="lifetime" sort={sort} order={order} onSort={onSort}>Lifetime</Th>
                    <Th>Segment</Th>
                    <Th sortKey="lastSeen" sort={sort} order={order} onSort={onSort}>Last seen</Th>
                    <Th sortKey="joined" sort={sort} order={order} onSort={onSort}>Joined</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {page.map((r) => {
                    const seg = r.segment ? segmentInfo(r.segment) : null;
                    return (
                      <tr key={r.membershipId} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/customers/${r.membershipId}`)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/5 font-display text-sm font-bold text-ink">
                              {(r.fullName ?? r.loyaltyId).trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{r.fullName ?? 'Unnamed member'}</p>
                              <p className="truncate font-mono text-xs text-muted-foreground">{r.loyaltyId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.tierName ?? '—'}</td>
                        <td className="px-4 py-3 font-display font-semibold">{fmt(r.available)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmt(r.lifetime)}</td>
                        <td className="px-4 py-3">
                          {seg ? (
                            <button
                              type="button"
                              title={seg.short}
                              onClick={(e) => { e.stopPropagation(); setExplaining(r); }}
                              className="rounded-full outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ink/30"
                            >
                              <Badge tone={seg.tone}>{seg.label}</Badge>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{daysAgo(r.lastActivityAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(r.joinedAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination offset={offset} limit={PAGE} total={filtered.length} onChange={setOffset} />
          </>
        )}
      </Card>

      <Modal
        open={explaining !== null}
        onClose={() => setExplaining(null)}
        title={explaining?.segment ? segmentInfo(explaining.segment).label : ''}
        subtitle={explaining?.segment ? segmentInfo(explaining.segment).short : undefined}
        size="lg"
      >
        {explaining && explaining.segment ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-foreground">{segmentInfo(explaining.segment).meaning}</p>
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to do</p>
              <p className="mt-1.5 text-sm leading-relaxed">{segmentInfo(explaining.segment).action}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why {explaining.fullName ?? 'this member'}</p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {[
                  { k: 'Recency', v: explaining.recencyDays == null ? '—' : `${explaining.recencyDays}d ago`, s: explaining.r },
                  { k: 'Frequency', v: `${explaining.frequency} earns`, s: explaining.f },
                  { k: 'Monetary', v: `${fmt(explaining.monetary)} pts`, s: explaining.m },
                ].map((c) => (
                  <div key={c.k} className="rounded-2xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">{c.k}</p>
                    <p className="mt-0.5 font-display text-lg font-bold leading-tight">{c.v}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">scores {c.s ?? '—'} of 5</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{segmentInfo(explaining.segment).rule}</p>
            </div>
            {all.length < MEANINGFUL_SAMPLE ? (
              <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4">
                <p className="text-sm font-semibold text-[#9b3b52]">Treat this as provisional</p>
                <p className="mt-1 text-sm leading-relaxed text-[#9b3b52]">
                  Scores are quintiles — each customer is ranked against the others, not a fixed bar. With {all.length}{' '}
                  {all.length === 1 ? 'member' : 'members'}, somebody is in the top fifth by arithmetic alone. These labels
                  start describing real behaviour from around {MEANINGFUL_SAMPLE} members.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
