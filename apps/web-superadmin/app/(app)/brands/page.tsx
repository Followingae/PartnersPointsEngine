'use client';

import { Building2, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getBrandsDirectory, manageBrand, type BrandDirectoryRow } from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

export default function BrandsDirectoryPage() {
  const toast = useToast();
  const [rows, setRows] = useState<BrandDirectoryRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getBrandsDirectory().then(setRows).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  const filtered = useMemo(() => rows.filter((r) => `${r.name} ${r.merchant}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  async function manage(id: string) {
    try {
      await manageBrand(id);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to open brand');
    }
  }

  return (
    <div>
      <PageHeader subtitle="Platform" title="Brands directory" action={<Badge tone="teal">{rows.length} brands</Badge>} />
      <Card className="p-5">
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search brands or merchants…" /></div>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Building2 size={22} />} title="No brands" hint="Brands created under merchants appear here." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Brand</th><th className="px-4 py-3 font-semibold">Merchant</th><th className="px-4 py-3 font-semibold">Members</th><th className="px-4 py-3 font-semibold">Liability</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-lime text-ink"><Building2 size={15} /></span><span className="font-semibold">{b.name}</span></div></td>
                    <td className="px-4 py-3 text-muted-foreground">{b.merchant}</td>
                    <td className="px-4 py-3">{fmt(b.members)}</td>
                    <td className="px-4 py-3 font-display font-semibold">{fmt(b.liability)} pts</td>
                    <td className="px-4 py-3"><Badge tone={b.status === 'active' ? 'lime' : 'neutral'}>{b.status}</Badge></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => manage(b.id)}><ExternalLink size={14} /> Manage</Button></td>
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
