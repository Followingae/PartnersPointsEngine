'use client';

import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createTier, deleteTier, getTiers, governanceMessage, governanceOutcome, updateTier, type TierRow } from '@/lib/api';

export default function TiersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TierRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TierRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTiers({ limit: 100 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => load(), [load]);

  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTier(toDelete.id);
      toast('success', `Deleted “${toDelete.name}”`);
      setToDelete(null);
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); setToDelete(null); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Membership tiers"
        action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New tier</Button>}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={<Layers size={22} />} title="No tiers yet" hint="Tiers reward your most loyal members with higher earn rates." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New tier</Button>} />
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t, i) => (
            <Card key={t.id} className="relative overflow-hidden p-5">
              <div className={`absolute inset-x-0 top-0 h-1.5 ${['bg-gradient-teal', 'bg-gradient-lime', 'bg-gradient-coral'][i % 3]}`} />
              <div className="flex items-start justify-between">
                <h3 className="font-display text-xl font-bold">{t.name}</h3>
                <ActionMenu actions={[
                  { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(t) },
                  { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(t) },
                ]} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Reach at</p>
              <p className="font-display text-2xl font-bold">{Number(t.threshold).toLocaleString()} pts</p>
              <div className="mt-2"><Badge tone="lime">{(t.multiplierBps / 10000).toFixed(2)}× earn</Badge></div>
            </Card>
          ))}
        </section>
      )}

      {editing ? <TierModal tier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        loading={busy}
        title="Delete tier?"
        message={`“${toDelete?.name}” will be removed. Members are reassigned to the next tier down by lifetime points.`}
      />
    </div>
  );
}

function TierModal({ tier, onClose, onSaved }: { tier: TierRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(tier?.name ?? '');
  const [threshold, setThreshold] = useState(tier ? String(tier.threshold) : '0');
  const [mult, setMult] = useState(tier ? String(tier.multiplierBps / 100) : '100');
  const [errors, setErrors] = useState<{ name?: string; threshold?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const e: { name?: string; threshold?: string } = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!Number.isInteger(Number(threshold)) || Number(threshold) < 0) e.threshold = 'Must be ≥ 0';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { name, threshold: Number(threshold), multiplierBps: Math.round(Number(mult) * 100) };
      if (tier) await updateTier(tier.id, body);
      else await createTier(body);
      toast('success', tier ? 'Tier updated' : 'Tier created');
      onSaved();
    } catch (err) {
      const g = governanceOutcome(err);
      if (g) { toast('info', governanceMessage(g)); if (g.kind === 'pending') onSaved(); }
      else toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tier ? 'Edit tier' : 'New tier'} subtitle={tier ? tier.name : 'Define a membership tier'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Gold" required error={errors.name} />
        <Field label="Lifetime points threshold" value={threshold} onChange={setThreshold} type="number" required error={errors.threshold} hint="Lifetime points a member needs to reach this tier" />
        <Field label="Earn multiplier (%)" value={mult} onChange={setMult} type="number" hint="100 = 1.0× · 150 = 1.5×" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{tier ? 'Save changes' : 'Create tier'}</Button>
        </div>
      </div>
    </Modal>
  );
}
