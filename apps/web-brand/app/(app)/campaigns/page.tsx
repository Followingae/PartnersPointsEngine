'use client';

import { Copy, Megaphone, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cloneCampaign, createCampaign, deleteCampaign, getCampaigns, governanceMessage, governanceOutcome, updateCampaign, type CampaignRow } from '@/lib/api';

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function CampaignsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CampaignRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<CampaignRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getCampaigns({ q, limit: 100 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggle(c: CampaignRow) {
    try {
      await updateCampaign(c.id, { enabled: !c.enabled });
      toast('success', c.enabled ? 'Campaign paused' : 'Campaign activated');
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) toast('info', governanceMessage(g));
      else toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onClone(c: CampaignRow) {
    try {
      await cloneCampaign(c.id);
      toast('success', `Duplicated “${c.name}”`);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteCampaign(toDelete.id);
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
        title="Campaigns"
        action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New campaign</Button>}
      />

      <Card className="p-5">
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search campaigns…" /></div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Megaphone size={22} />} title="No campaigns yet" hint="Run time-boxed bonus campaigns to drive activity." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New campaign</Button>} />
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-coral text-ink"><Megaphone size={18} /></span>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.enabled ? 'lime' : 'neutral'}>{c.enabled ? 'active' : 'paused'}</Badge>
                    <ActionMenu actions={[
                      { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(c) },
                      { label: c.enabled ? 'Pause' : 'Activate', icon: <Power size={14} />, onClick: () => toggle(c) },
                      { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => onClone(c) },
                      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(c) },
                    ]} />
                  </div>
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">{c.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.startsAt ? new Date(c.startsAt).toLocaleDateString() : 'always'} → {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : 'open'}
                </p>
              </Card>
            ))}
          </section>
        )}
      </Card>

      {editing ? <CampaignModal campaign={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        loading={busy}
        title="Delete campaign?"
        message={`“${toDelete?.name}” will be permanently removed.`}
      />
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
interface CondLeaf { attr?: string; op?: string; value?: unknown }
const readLeaves = (cond: unknown): CondLeaf[] => {
  if (!cond || typeof cond !== 'object') return [];
  const c = cond as { all?: CondLeaf[] } & CondLeaf;
  return Array.isArray(c.all) ? c.all : [c];
};

function CampaignModal({ campaign, onClose, onSaved }: { campaign: CampaignRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const def = (campaign?.definition ?? {}) as { actions?: Array<{ type?: string; points?: number; factor?: number }>; condition?: unknown };
  const a0 = def.actions?.[0];
  const leaves = readLeaves(def.condition);
  const find = (attr: string, op?: string) => leaves.find((l) => l.attr === attr && (!op || l.op === op));
  const startLeaf = find('session.minuteOfDay', 'gte');
  const endLeaf = find('session.minuteOfDay', 'lt');
  const dayLeaf = find('session.dayOfWeek', 'in');

  const [name, setName] = useState(campaign?.name ?? '');
  const [kind, setKind] = useState<'bonus' | 'multiplier'>(a0?.type === 'multiplier' ? 'multiplier' : 'bonus');
  const [bonus, setBonus] = useState(String(a0?.points ?? 25));
  const [factor, setFactor] = useState(String(a0?.factor ?? 2));
  const [minSpend, setMinSpend] = useState(String((find('session.amountMinor', 'gte')?.value as number) ?? 0));
  const [startsAt, setStartsAt] = useState(toDateInput(campaign?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(campaign?.endsAt ?? null));
  const [scheduled, setScheduled] = useState(Boolean(startLeaf || endLeaf || dayLeaf));
  const [days, setDays] = useState<number[]>((dayLeaf?.value as number[]) ?? [0, 1, 2, 3, 4, 5, 6]);
  const [startTime, setStartTime] = useState(startLeaf ? minToTime(startLeaf.value as number) : '16:00');
  const [endTime, setEndTime] = useState(endLeaf ? minToTime(endLeaf.value as number) : '18:00');
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => a - b)));

  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    if (scheduled && timeToMin(endTime) <= timeToMin(startTime)) { toast('error', 'Window end must be after start (same-day windows only)'); return; }
    if (scheduled && days.length === 0) { toast('error', 'Pick at least one day for the window'); return; }
    setSaving(true);
    try {
      const action = kind === 'multiplier' ? { type: 'multiplier', factor: Number(factor) } : { type: 'bonus', points: Number(bonus) };
      const conds: CondLeaf[] = [];
      if (Number(minSpend) > 0) conds.push({ attr: 'session.amountMinor', op: 'gte', value: Number(minSpend) });
      if (scheduled) {
        if (days.length < 7) conds.push({ attr: 'session.dayOfWeek', op: 'in', value: days });
        conds.push({ attr: 'session.minuteOfDay', op: 'gte', value: timeToMin(startTime) });
        conds.push({ attr: 'session.minuteOfDay', op: 'lt', value: timeToMin(endTime) });
      }
      const definition: Record<string, unknown> = { actions: [action] };
      if (conds.length === 1) definition.condition = conds[0];
      else if (conds.length > 1) definition.condition = { all: conds };
      const body = {
        name,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        definition,
      };
      if (campaign) await updateCampaign(campaign.id, body);
      else await createCampaign({ name, startsAt: body.startsAt ?? undefined, endsAt: body.endsAt ?? undefined, definition });
      toast('success', campaign ? 'Campaign updated' : 'Campaign created');
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
    <Modal open onClose={onClose} title={campaign ? 'Edit campaign' : 'New campaign'} subtitle={campaign ? campaign.name : 'Time-boxed bonus or happy-hour campaign'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Happy Hour Double Points" required error={errors.name} />
        <Select label="Reward" value={kind} onChange={(v) => setKind(v as 'bonus' | 'multiplier')} options={[{ value: 'bonus', label: 'Bonus points (flat)' }, { value: 'multiplier', label: 'Points multiplier (e.g. 2× happy hour)' }]} />
        <div className="grid grid-cols-2 gap-3">
          {kind === 'multiplier'
            ? <Field label="Multiplier (×)" value={factor} onChange={setFactor} type="number" hint="2 = double points" />
            : <Field label="Bonus points" value={bonus} onChange={setBonus} type="number" />}
          <Field label="Min spend (minor units)" value={minSpend} onChange={setMinSpend} type="number" hint="0 = any spend" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (date)" value={startsAt} onChange={setStartsAt} type="date" hint="Blank = immediately" />
          <Field label="Ends (date)" value={endsAt} onChange={setEndsAt} type="date" hint="Blank = open-ended" />
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium">
          <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} className="h-4 w-4 rounded border-input accent-ink" />
          Happy hour / recurring time window
        </label>
        {scheduled ? (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/40 p-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Active days</p>
              <div className="flex flex-wrap gap-1.5">
                {DOW.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i)} className={`h-8 w-11 rounded-xl text-xs font-semibold transition ${days.includes(i) ? 'bg-ink text-white' : 'border border-border bg-white text-muted-foreground hover:bg-muted'}`}>{d}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" value={startTime} onChange={setStartTime} type="time" />
              <Field label="To" value={endTime} onChange={setEndTime} type="time" hint="Same-day window, local time" />
            </div>
            <p className="text-xs text-muted-foreground">Reward applies only inside this window (on top of the date range), in your local timezone.</p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{campaign ? 'Save changes' : 'Create campaign'}</Button>
        </div>
      </div>
    </Modal>
  );
}
