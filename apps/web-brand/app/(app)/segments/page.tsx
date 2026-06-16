'use client';

import { Pencil, Plus, Trash2, Users2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createSegment, deleteSegment, getSegments, previewSegment, updateSegment, type SegmentDefinition, type SegmentPreview, type SegmentRow, type SegmentRule } from '@/lib/api';

const FIELDS = [
  { value: 'lifetime', label: 'Lifetime points' },
  { value: 'recencyDays', label: 'Days since last visit' },
  { value: 'frequency', label: 'Visit count' },
  { value: 'tier', label: 'Tier' },
  { value: 'status', label: 'Status' },
];
const OPS = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
];
const fieldLabel = (f: string) => FIELDS.find((x) => x.value === f)?.label ?? f;
const opLabel = (o: string) => OPS.find((x) => x.value === o)?.label ?? o;
const ruleSummary = (def: SegmentDefinition) =>
  (def.rules ?? []).length === 0 ? 'All members' : (def.rules ?? []).map((r) => `${fieldLabel(r.field)} ${opLabel(r.op)} ${r.value}`).join(def.match === 'any' ? '  OR  ' : '  AND  ');

export default function SegmentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SegmentRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SegmentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getSegments().then((r) => setRows(r.rows)).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteSegment(toDelete.id);
      toast('success', `Deleted “${toDelete.name}”`);
      setToDelete(null);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Segments" action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New segment</Button>} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-5"><EmptyState icon={<Users2 size={22} />} title="No segments yet" hint="Build a rule-based audience to target campaigns." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New segment</Button>} /></Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-teal text-ink"><Users2 size={18} /></span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                    {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}
                  </div>
                </div>
                <ActionMenu actions={[
                  { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(s) },
                  { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(s) },
                ]} />
              </div>
              <div className="mt-4 rounded-2xl bg-muted/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Audience: </span><span className="font-medium">{ruleSummary(s.definition)}</span>
              </div>
            </Card>
          ))}
        </section>
      )}

      {editing ? <SegmentBuilder segment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}
      <ConfirmDialog open={toDelete !== null} onClose={() => setToDelete(null)} onConfirm={onDelete} loading={busy} title="Delete segment?" message={`“${toDelete?.name}” will be archived.`} />
    </div>
  );
}

function SegmentBuilder({ segment, onClose, onSaved }: { segment: SegmentRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(segment?.name ?? '');
  const [description, setDescription] = useState(segment?.description ?? '');
  const [match, setMatch] = useState<'all' | 'any'>(segment?.definition.match ?? 'all');
  const [rules, setRules] = useState<SegmentRule[]>(segment?.definition.rules ?? [{ field: 'lifetime', op: 'gte', value: '500' }]);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  const def: SegmentDefinition = { match, rules };

  // live preview (debounced) as rules change
  useEffect(() => {
    setPreviewing(true);
    const t = setTimeout(() => {
      previewSegment({ match, rules })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [match, JSON.stringify(rules)]);

  const setRule = (i: number, patch: Partial<SegmentRule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, { field: 'lifetime', op: 'gte', value: '0' }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));

  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    setSaving(true);
    try {
      if (segment) await updateSegment(segment.id, { name, description, definition: def });
      else await createSegment({ name, description: description || undefined, definition: def });
      toast('success', segment ? 'Segment updated' : 'Segment created');
      onSaved();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={segment ? 'Edit segment' : 'New segment'} subtitle="Define a rule-based audience">
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. High-value at risk" required error={errors.name} />
        <Field label="Description" value={description} onChange={setDescription} placeholder="Optional" />

        <div className="rounded-2xl border border-border/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="font-medium">Match</span>
            <Select label="" value={match} onChange={(v) => setMatch(v as 'all' | 'any')} options={[{ value: 'all', label: 'ALL rules (AND)' }, { value: 'any', label: 'ANY rule (OR)' }]} />
          </div>
          <div className="space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={r.field} onChange={(e) => setRule(i, { field: e.target.value })} className="flex-1 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ink">
                  {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} className="w-16 rounded-xl border border-input bg-white px-2 py-2 text-center text-sm outline-none focus:border-ink">
                  {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })} className="w-28 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
                <button onClick={() => removeRule(i)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={addRule} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0f6b66] hover:underline"><Plus size={14} /> Add rule</button>
        </div>

        {/* live preview */}
        <div className="rounded-2xl bg-gradient-teal/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Estimated audience</span>
            <span className="font-display text-2xl font-bold">{previewing ? '…' : (preview?.count ?? 0).toLocaleString()}<span className="ml-1 text-sm font-medium text-muted-foreground">members</span></span>
          </div>
          {preview?.sample.length ? (
            <p className="mt-2 truncate text-xs text-muted-foreground">e.g. {preview.sample.slice(0, 4).map((s) => s.loyaltyId).join(', ')}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{segment ? 'Save segment' : 'Create segment'}</Button>
        </div>
      </div>
    </Modal>
  );
}
