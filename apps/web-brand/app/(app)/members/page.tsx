'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, Pagination, SearchInput, TableSkeleton, Th } from '@/components/ui';
import { getMembers, type MemberRow } from '@/lib/api';

const fmt = (v: string) => Number(v).toLocaleString();
const LIMIT = 25;

export default function MembersPage() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('available');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(() => {
    setLoading(true);
    getMembers({ q, status, sort, order, limit: LIMIT, offset })
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, status, sort, order, offset]);

  // debounce search; reset to first page on filter change
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const onSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setOrder('desc');
    }
    setOffset(0);
  };

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Members" action={<Badge tone="lime">{total} members</Badge>} />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search by loyalty ID…" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
            className="rounded-2xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-ink focus:ring-4 focus:ring-primary/30"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {err ? <p className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p> : null}

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No members found" hint={q ? 'Try a different search.' : 'Members appear here once they earn points.'} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th sortKey="loyaltyId" sort={sort} order={order} onSort={onSort}>Loyalty ID</Th>
                  <Th sortKey="available" sort={sort} order={order} onSort={onSort}>Available</Th>
                  <Th sortKey="lifetime" sort={sort} order={order} onSort={onSort}>Lifetime</Th>
                  <Th sortKey="joinedAt" sort={sort} order={order} onSort={onSort}>Joined</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((m) => (
                  <tr key={m.membershipId} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/customers/${m.membershipId}`)}>
                    <td className="px-4 py-3 font-mono text-xs">{m.loyaltyId}</td>
                    <td className="px-4 py-3 font-display font-semibold">{fmt(m.available)}</td>
                    <td className="px-4 py-3">{fmt(m.lifetime)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Badge tone={m.status === 'active' ? 'lime' : 'neutral'}>{m.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > LIMIT ? <Pagination offset={offset} limit={LIMIT} total={total} onChange={setOffset} /> : null}
      </Card>
    </div>
  );
}
