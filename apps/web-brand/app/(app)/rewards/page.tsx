'use client';

import { Copy, Gift, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select, Textarea } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cloneReward, createReward, deleteReward, getRewards, governanceMessage, governanceOutcome, updateReward, type RewardRow } from '@/lib/api';

const KINDS = [
  { value: 'voucher', label: 'Voucher' },
  { value: 'discount', label: 'Discount' },
  { value: 'free_item', label: 'Free item' },
];

export default function RewardsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RewardRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RewardRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<RewardRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getRewards({ q, status: 'all', limit: 100 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteReward(toDelete.id);
      toast('success', `Archived “${toDelete.name}”`);
      setToDelete(null);
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) {
        toast('info', governanceMessage(g));
        setToDelete(null);
      } else {
        toast('error', e instanceof Error ? e.message : 'Failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onClone(r: RewardRow) {
    try {
      await cloneReward(r.id);
      toast('success', `Duplicated “${r.name}”`);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Rewards"
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} /> New reward
          </Button>
        }
      />

      <Card className="p-5">
        <div className="mb-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search rewards…" />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Gift size={22} />} title="No rewards yet" hint="Create a reward customers can redeem points for." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New reward</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <RewardCard key={r.id} reward={r} onEdit={() => setEditing(r)} onDelete={() => setToDelete(r)} onClone={() => onClone(r)} />
            ))}
          </div>
        )}
      </Card>

      {editing ? <RewardModal reward={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        loading={busy}
        title="Archive reward?"
        message={`“${toDelete?.name}” will be removed from the catalog. Issued vouchers keep working.`}
        confirmLabel="Archive"
      />
    </div>
  );
}

function RewardCard({ reward, onEdit, onDelete, onClone }: { reward: RewardRow; onEdit: () => void; onDelete: () => void; onClone: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative flex flex-col rounded-3xl border border-border/70 bg-card p-5 transition hover:shadow-card">
      <div className="flex items-start justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-coral text-ink"><Gift size={18} /></span>
        <div className="flex items-center gap-2">
          {reward.status !== 'active' ? <Badge tone="neutral">{reward.status}</Badge> : null}
          <div className="relative" ref={ref}>
            <button onClick={() => setMenu((m) => !m)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <MoreVertical size={16} />
            </button>
            {menu ? (
              <div className="absolute right-0 top-9 z-10 w-36 overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-hero">
                <MenuItem icon={<Pencil size={14} />} onClick={() => { setMenu(false); onEdit(); }}>Edit</MenuItem>
                <MenuItem icon={<Copy size={14} />} onClick={() => { setMenu(false); onClone(); }}>Duplicate</MenuItem>
                <MenuItem icon={<Trash2 size={14} />} danger onClick={() => { setMenu(false); onDelete(); }}>Archive</MenuItem>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold">{reward.name}</h3>
      {reward.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{reward.description}</p> : null}
      <div className="mt-4 flex items-center justify-between">
        <span className="font-display text-xl font-bold">{Number(reward.pointsCost).toLocaleString()}<span className="ml-1 text-sm font-medium text-muted-foreground">pts</span></span>
        <Badge tone="teal">{reward.kind.replace(/_/g, ' ')}</Badge>
      </div>
    </div>
  );
}

function MenuItem({ children, icon, onClick, danger }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted ${danger ? 'text-destructive' : ''}`}>
      {icon} {children}
    </button>
  );
}

function RewardModal({ reward, onClose, onSaved }: { reward: RewardRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(reward?.name ?? '');
  const [description, setDescription] = useState(reward?.description ?? '');
  const [pointsCost, setPointsCost] = useState(reward ? String(reward.pointsCost) : '500');
  const [kind, setKind] = useState(reward?.kind ?? 'voucher');
  const [errors, setErrors] = useState<{ name?: string; pointsCost?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const e: { name?: string; pointsCost?: string } = {};
    if (!name.trim()) e.name = 'Name is required';
    const cost = Number(pointsCost);
    if (!Number.isInteger(cost) || cost < 1) e.pointsCost = 'Must be a whole number ≥ 1';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      if (reward) await updateReward(reward.id, { name, description, pointsCost: cost, kind });
      else await createReward({ name, description: description || undefined, pointsCost: cost, kind });
      toast('success', reward ? 'Reward updated' : 'Reward created');
      onSaved();
    } catch (err) {
      const g = governanceOutcome(err);
      if (g) {
        toast('info', governanceMessage(g));
        if (g.kind === 'pending') onSaved();
      } else {
        toast('error', err instanceof Error ? err.message : 'Failed');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={reward ? 'Edit reward' : 'New reward'} subtitle={reward ? reward.name : 'Add a redeemable catalog item'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Free latte" required error={errors.name} />
        <Textarea label="Description" value={description} onChange={setDescription} placeholder="Shown to members at redemption (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Points cost" value={pointsCost} onChange={setPointsCost} type="number" required error={errors.pointsCost} />
          <Select label="Kind" value={kind} onChange={setKind} options={KINDS} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{reward ? 'Save changes' : 'Create reward'}</Button>
        </div>
      </div>
    </Modal>
  );
}
