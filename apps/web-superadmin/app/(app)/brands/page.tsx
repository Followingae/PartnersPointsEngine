'use client';

import { Building2, ExternalLink, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, Skeleton, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getBrandModules, getBrandsDirectory, manageBrand, setBrandModules, type BrandDirectoryRow, type BrandModules } from '@/lib/api';

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

  const [accessBrand, setAccessBrand] = useState<{ id: string; name: string } | null>(null);

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
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setAccessBrand({ id: b.id, name: b.name })}><SlidersHorizontal size={14} /> Access</Button>
                        <Button size="sm" variant="outline" onClick={() => manage(b.id)}><ExternalLink size={14} /> Manage</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {accessBrand ? <ModulesModal brand={accessBrand} onClose={() => setAccessBrand(null)} /> : null}
    </div>
  );
}

const LOYALTY_KEYS = ['loyalty_online', 'loyalty_instore'];
function ModulesModal({ brand, onClose }: { brand: { id: string; name: string }; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<BrandModules | null>(null);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBrandModules(brand.id)
      .then((d) => { setData(d); setAccess(d.access ?? {}); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [brand.id, toast]);

  const enabled = (k: string) => access[k] !== false; // absent = enabled
  const toggle = (k: string) => setAccess((a) => ({ ...a, [k]: !enabled(k) }));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const full = Object.fromEntries(data.modules.map((m) => [m.key, enabled(m.key)]));
      await setBrandModules(brand.id, full);
      toast('success', 'Access updated');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const Toggle = ({ k, label }: { k: string; label: string }) => (
    <button type="button" onClick={() => toggle(k)} className="flex w-full items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-left transition hover:bg-muted/50">
      <span className="text-sm font-medium">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${enabled(k) ? 'bg-ink' : 'bg-muted'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled(k) ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

  return (
    <Modal open onClose={onClose} title="Modules & access" subtitle={brand.name}>
      {!data ? (
        <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loyalty types</p>
            <div className="space-y-2">
              {data.modules.filter((m) => LOYALTY_KEYS.includes(m.key)).map((m) => <Toggle key={m.key} k={m.key} label={m.label} />)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature modules</p>
            <div className="space-y-2">
              {data.modules.filter((m) => !LOYALTY_KEYS.includes(m.key)).map((m) => <Toggle key={m.key} k={m.key} label={m.label} />)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Disabled modules are hidden from the brand console and blocked in the API. Core features (members, rewards, earn rules) are always on.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save access</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
