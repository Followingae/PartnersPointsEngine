'use client';

import { Building2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, TableSkeleton, Th } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createGroup, getGroups, type GroupRow } from '@/lib/api';

const money = (minor: string, currency = 'AED') => `${currency} ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function MerchantsPage() {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getGroups()
      .then(setRows)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => load(), [load]);

  const filtered = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  return (
    <div>
      <PageHeader
        subtitle="Platform"
        title="Merchants"
        action={<Button onClick={() => setOnboarding(true)}><Plus size={16} /> Onboard merchant</Button>}
      />

      <Card className="p-5">
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search merchants…" /></div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Building2 size={22} />} title="No merchants found" hint={q ? 'Try a different search.' : 'Onboard your first merchant group.'} action={!q ? <Button onClick={() => setOnboarding(true)}><Plus size={16} /> Onboard merchant</Button> : undefined} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th>Merchant</Th>
                  <Th>Currency</Th>
                  <Th>Brands</Th>
                  <Th>Wallet balance</Th>
                  <Th>Points liability</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filtered.map((g) => (
                  <tr key={g.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/merchants/${g.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-coral text-ink"><Building2 size={15} /></span>
                        <span className="font-semibold">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{g.currency}</td>
                    <td className="px-4 py-3"><Badge tone="teal">{g.brands}</Badge></td>
                    <td className="px-4 py-3 font-display font-semibold">{money(g.walletBalance, g.currency)}</td>
                    <td className="px-4 py-3">{Number(g.pointsLiability).toLocaleString()} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {onboarding ? <OnboardModal onClose={() => setOnboarding(false)} onDone={(id) => { setOnboarding(false); router.push(`/merchants/${id}`); }} /> : null}
    </div>
  );
}

const CURRENCIES = [
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EGP', label: 'EGP — Egyptian Pound' },
];
const REGIONS = [
  { value: 'uae', label: 'United Arab Emirates' },
  { value: 'ksa', label: 'Saudi Arabia' },
  { value: 'egypt', label: 'Egypt' },
  { value: 'global', label: 'Global' },
];

function OnboardModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [region, setRegion] = useState('uae');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { setError('Merchant name is required'); return; }
    setSaving(true);
    try {
      const g = await createGroup({ name, defaultCurrency: currency, homeRegion: region });
      toast('success', `Onboarded “${name}” — prepaid wallet created`);
      onDone(g.id);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="Onboard merchant" subtitle="Creates the group and its prepaid wallet">
      <div className="space-y-4">
        <Field label="Merchant name" value={name} onChange={setName} placeholder="e.g. Roastery Holdings" required error={error} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Default currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
          <Select label="Home region" value={region} onChange={setRegion} options={REGIONS} />
        </div>
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          A prepaid wallet is created automatically. You can add brands, credit the wallet, and configure cost rules from the merchant page next.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create merchant</Button>
        </div>
      </div>
    </Modal>
  );
}
