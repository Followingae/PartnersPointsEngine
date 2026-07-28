'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getCustomers, type AdminCustomerRow } from '@/lib/api';

/** Platform-wide customer visibility: every person, across every brand. */
export default function CustomersPage() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<AdminCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getCustomers({ q, limit: 100 })
      .then((r) => { setRows(r.rows); setTotal(r.total); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        subtitle="Platform"
        title="Customers"
        action={<Badge tone="teal">{total.toLocaleString()} total</Badge>}
      />

      <Card className="p-5">
        <div className="mb-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search by name, mobile number, or loyalty ID…" />
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={q ? 'No customers match' : 'No customers yet'}
            hint={q ? 'Try a mobile number like 0501234567.' : 'Customers appear as terminals enrol them.'}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Brands</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/customers/${c.id}`)}>
                    <td className="px-4 py-3 font-medium">{c.fullName ?? <span className="text-muted-foreground">Unnamed</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.brands.length ? c.brands.join(', ') : <span className="text-muted-foreground">None</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3"><Badge tone={c.status === 'active' ? 'lime' : 'neutral'}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
