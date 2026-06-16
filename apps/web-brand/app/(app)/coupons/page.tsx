'use client';

import { Archive, Download, PauseCircle, PlayCircle, Plus, Ticket } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, SearchInput, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { bulkGenerateCoupons, downloadCsv, getCouponBatches, getCoupons, updateCoupon, type CouponBatch, type CouponRow } from '@/lib/api';

const KINDS = [
  { value: 'discount', label: 'Fixed discount' },
  { value: 'percent_discount', label: 'Percentage discount' },
  { value: 'bonus_points', label: 'Bonus points' },
  { value: 'free_item', label: 'Free item' },
];
const fmt = (v: string | number) => Number(v).toLocaleString();

function valueLabel(c: CouponRow): string {
  if (c.kind === 'percent_discount') return `${c.percentOff ?? 0}% off`;
  if (c.kind === 'bonus_points') return `+${fmt(c.valueMinor)} pts`;
  if (c.kind === 'free_item') return 'Free item';
  return `${fmt(c.valueMinor)} off`;
}

export default function CouponsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [batches, setBatches] = useState<CouponBatch[]>([]);
  const [q, setQ] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getCoupons({ q, ...(batchId ? { batchId } : {}), limit: 100 }), getCouponBatches()])
      .then(([c, b]) => { setRows(c.rows); setBatches(b); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, batchId, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function setStatus(c: CouponRow, status: string) {
    try {
      await updateCoupon(c.id, { status });
      toast('success', `Coupon ${status}`);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Coupons"
        action={<Button onClick={() => setGen(true)}><Plus size={16} /> Bulk generate</Button>}
      />

      {batches.length ? (
        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batches.slice(0, 6).map((b) => (
            <button
              key={b.batchId}
              onClick={() => setBatchId(batchId === b.batchId ? null : b.batchId)}
              className={`rounded-3xl border p-4 text-left transition ${batchId === b.batchId ? 'border-ink bg-muted/50' : 'border-border/70 hover:bg-muted/30'}`}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-coral text-ink"><Ticket size={16} /></span>
                <Badge tone="teal">{b.codes} codes</Badge>
              </div>
              <p className="mt-2 font-semibold">{b.campaignName ?? 'Untitled batch'}</p>
              <p className="text-xs text-muted-foreground">{b.redeemed} redeemed · {new Date(b.createdAt).toLocaleDateString()}</p>
            </button>
          ))}
        </section>
      ) : null}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search codes…" />
            {batchId ? <Button size="sm" variant="ghost" onClick={() => setBatchId(null)}>Clear batch filter</Button> : null}
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`/manage/coupons/export.csv${batchId ? `?batchId=${batchId}` : ''}`, 'coupons.csv').catch(() => toast('error', 'Export failed'))}>
            <Download size={14} /> CSV
          </Button>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Ticket size={22} />} title="No coupons yet" hint="Bulk-generate promo codes for a campaign." action={<Button onClick={() => setGen(true)}><Plus size={16} /> Bulk generate</Button>} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Reward</th>
                  <th className="px-4 py-3 font-semibold">Usage</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{c.code}</td>
                    <td className="px-4 py-3">{valueLabel(c)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.redeemedCount}/{c.maxRedemptions}</td>
                    <td className="px-4 py-3"><Badge tone={c.status === 'active' ? 'lime' : c.status === 'paused' ? 'neutral' : 'coral'}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <ActionMenu actions={[
                        c.status === 'active'
                          ? { label: 'Pause', icon: <PauseCircle size={14} />, onClick: () => setStatus(c, 'paused') }
                          : { label: 'Activate', icon: <PlayCircle size={14} />, onClick: () => setStatus(c, 'active') },
                        { label: 'Archive', icon: <Archive size={14} />, danger: true, onClick: () => setStatus(c, 'archived') },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {gen ? <GenerateModal onClose={() => setGen(false)} onDone={() => { setGen(false); load(); }} /> : null}
    </div>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [pattern, setPattern] = useState('SUMMER-####');
  const [count, setCount] = useState('100');
  const [kind, setKind] = useState('discount');
  const [value, setValue] = useState('1000');
  const [percentOff, setPercentOff] = useState('10');
  const [maxRedemptions, setMaxRedemptions] = useState('1');
  const [perCustomerLimit, setPerCustomerLimit] = useState('1');
  const [campaignName, setCampaignName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [errors, setErrors] = useState<{ pattern?: string; count?: string }>({});
  const [saving, setSaving] = useState(false);
  const isPct = kind === 'percent_discount';
  const isPoints = kind === 'bonus_points';

  async function submit() {
    const e: { pattern?: string; count?: string } = {};
    if (!pattern.trim()) e.pattern = 'Pattern is required';
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 10000) e.count = '1–10,000';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const res = await bulkGenerateCoupons({
        pattern,
        count: n,
        kind,
        ...(isPct ? { percentOff: Number(percentOff) } : { valueMinor: Number(value) }),
        maxRedemptions: Number(maxRedemptions),
        perCustomerLimit: Number(perCustomerLimit),
        campaignName: campaignName || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      toast('success', `Generated ${res.created} codes (e.g. ${res.sample[0]})`);
      onDone();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Bulk-generate coupons" subtitle="Each '#' in the pattern becomes a random character">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code pattern" value={pattern} onChange={setPattern} placeholder="SUMMER-####" required error={errors.pattern} hint="No '#' → a random suffix is appended" />
          <Field label="How many" value={count} onChange={setCount} type="number" required error={errors.count} />
        </div>
        <Field label="Campaign name" value={campaignName} onChange={setCampaignName} placeholder="e.g. Summer 2026" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Reward type" value={kind} onChange={setKind} options={KINDS} />
          {isPct ? <Field label="Percent off" value={percentOff} onChange={setPercentOff} type="number" />
            : <Field label={isPoints ? 'Bonus points' : 'Discount (minor units)'} value={value} onChange={setValue} type="number" />}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Max redemptions" value={maxRedemptions} onChange={setMaxRedemptions} type="number" hint="per code" />
          <Field label="Per-customer" value={perCustomerLimit} onChange={setPerCustomerLimit} type="number" hint="limit" />
          <Field label="Expires" value={expiresAt} onChange={setExpiresAt} type="date" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Generate codes</Button>
        </div>
      </div>
    </Modal>
  );
}
