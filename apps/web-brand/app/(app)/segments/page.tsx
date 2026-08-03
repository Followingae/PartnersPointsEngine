'use client';

import { Pencil, Plus, Trash2, Users2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createSegment, deleteSegment, getSegmentFields, getSegments, previewSegment, updateSegment, type SegmentDefinition, type SegmentField, type SegmentPreview, type SegmentRow, type SegmentRule } from '@/lib/api';

/**
 * Operator labels. The set of operators *available* comes from the engine per
 * field; this only decides how each one reads.
 */
const OP_LABEL: Record<string, string> = {
  gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=', neq: '≠',
  in: 'is one of', not_in: 'is not one of', is_set: 'is given', is_not_set: 'is not given',
};

/** Shown until the engine's field list arrives, so the first paint isn't empty. */
const FALLBACK_FIELDS: SegmentField[] = [
  { key: 'lifetime', label: 'Lifetime points', type: 'number', ops: ['gte', 'lte', 'gt', 'lt', 'eq', 'neq'] },
];

const opLabel = (o: string) => OP_LABEL[o] ?? o;
const ruleSummary = (def: SegmentDefinition, fields: SegmentField[] = []) => {
  const label = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const rules = def.rules ?? [];
  if (rules.length === 0) return 'All members';
  return rules
    .map((r) => {
      const value = Array.isArray(r.value) ? r.value.join(', ') : r.value;
      // A nullary operator reads as a sentence on its own — "Nationality is not
      // given" rather than "Nationality is not given ''".
      return ['is_set', 'is_not_set'].includes(r.op)
        ? `${label(r.field)} ${opLabel(r.op)}`
        : `${label(r.field)} ${opLabel(r.op)} ${value}`;
    })
    .join(def.match === 'any' ? '  OR  ' : '  AND  ');
};

export default function SegmentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SegmentRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SegmentRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Field metadata is only needed to label rules in the summary line; a slow or
  // failed fetch shouldn't stop the segments themselves rendering.
  const [fields, setFields] = useState<SegmentField[]>(FALLBACK_FIELDS);
  useEffect(() => {
    getSegmentFields().then(setFields).catch(() => undefined);
  }, []);

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
                <span className="text-muted-foreground">Audience: </span><span className="font-medium">{ruleSummary(s.definition, fields)}</span>
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
  const [fields, setFields] = useState<SegmentField[]>(FALLBACK_FIELDS);

  // Served by the engine, so a new attribute appears here the moment the
  // engine understands it.
  useEffect(() => {
    getSegmentFields().then(setFields).catch(() => undefined);
  }, []);

  const fieldOf = (key: string) => fields.find((f) => f.key === key) ?? fields[0];
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
                <select
                  value={r.field}
                  onChange={(e) => {
                    // Operators are per field, so changing the field may leave
                    // an operator the new one doesn't support.
                    const next = fieldOf(e.target.value);
                    const op = next?.ops.includes(r.op) ? r.op : (next?.ops[0] ?? 'eq');
                    setRule(i, { field: e.target.value, op, value: next?.options?.[0]?.value ?? '' });
                  }}
                  className="flex-1 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                >
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} className="w-32 rounded-xl border border-input bg-white px-2 py-2 text-center text-sm outline-none focus:border-ink">
                  {(fieldOf(r.field)?.ops ?? []).map((o) => <option key={o} value={o}>{opLabel(o)}</option>)}
                </select>
                <RuleValue field={fieldOf(r.field)} rule={r} onChange={(value) => setRule(i, { value })} />
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

/**
 * The value control for one rule.
 *
 * A single free-text box was fine when every field was a number, but it made
 * nationality unusable — a brand had to know that "United Arab Emirates" is
 * typed as `AE`. Enum fields get a picker, and set operators get a multi-select
 * so "is one of" can actually take several.
 */
function RuleValue({
  field,
  rule,
  onChange,
}: {
  field?: SegmentField;
  rule: SegmentRule;
  onChange: (value: string | number | Array<string | number>) => void;
}) {
  // Nothing to enter for "is given" / "is not given".
  if (['is_set', 'is_not_set'].includes(rule.op)) {
    return <div className="w-40 shrink-0 text-center text-sm text-muted-foreground">—</div>;
  }

  const multiple = ['in', 'not_in'].includes(rule.op);

  if (field?.type === 'enum' && field.options) {
    const selected = Array.isArray(rule.value)
      ? rule.value.map(String)
      : String(rule.value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    return (
      <select
        multiple={multiple}
        value={multiple ? selected : selected[0] ?? ''}
        onChange={(e) =>
          onChange(
            multiple
              ? Array.from(e.target.selectedOptions, (o) => o.value)
              : e.target.value,
          )
        }
        className="w-40 shrink-0 rounded-xl border border-input bg-white px-2 py-2 text-sm outline-none focus:border-ink"
        size={multiple ? 4 : undefined}
      >
        {!multiple && <option value="">Choose…</option>}
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field?.type === 'number' ? 'number' : 'text'}
      value={Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 shrink-0 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ink"
    />
  );
}
