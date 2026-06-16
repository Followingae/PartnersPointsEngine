'use client';

import { Coins, Copy, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, SearchInput, TableSkeleton, Th } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cloneEarnRule, createEarnRule, deleteEarnRule, getEarnRules, getModuleAccess, governanceMessage, governanceOutcome, updateEarnRule, type EarnRuleRow } from '@/lib/api';

type Kind = 'perAmount' | 'perVisit' | 'bonus' | 'multiplier';
type RuleChannel = 'both' | 'online' | 'in_store';

interface Action { type?: string; pointsPerUnit?: number; unitMinor?: number; points?: number; factorBps?: number }
interface Condition { attr?: string; op?: string; value?: number }
interface Def { actions?: Action[]; condition?: Condition; channel?: 'online' | 'in_store' }

const TYPE_META: Record<'online' | 'in_store' | 'both', { label: string; tone: 'teal' | 'coral' | 'neutral' }> = {
  online: { label: 'Online', tone: 'teal' },
  in_store: { label: 'In-store', tone: 'coral' },
  both: { label: 'All types', tone: 'neutral' },
};
const ruleChannel = (def: Def): 'online' | 'in_store' | 'both' => def.channel ?? 'both';

function summarize(def: Def): string {
  const a = def.actions?.[0];
  let base = 'No effect';
  if (a?.type === 'perAmount') base = `${a.pointsPerUnit ?? 0} pt / ${((a.unitMinor ?? 100) / 100).toLocaleString()} spent`;
  else if (a?.type === 'perVisit') base = `${a.points ?? 0} pts per visit`;
  else if (a?.type === 'bonus') base = `${a.points ?? 0} bonus pts`;
  else if (a?.type === 'multiplier') base = `${((a.factorBps ?? 10000) / 10000).toFixed(2)}× points`;
  if (def.condition?.value) base += ` · when spend ≥ ${(def.condition.value / 100).toLocaleString()}`;
  return base;
}

export default function EarnRulesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<EarnRuleRow[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('priority');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EarnRuleRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<EarnRuleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<{ online: boolean; inStore: boolean }>({ online: true, inStore: true });

  useEffect(() => {
    getModuleAccess()
      .then((r) => setTypes({ online: r.access.loyalty_online !== false, inStore: r.access.loyalty_instore !== false }))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getEarnRules({ q, sort, order, limit: 100 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, sort, order, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const onSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('asc'); }
  };

  async function toggle(r: EarnRuleRow) {
    try {
      await updateEarnRule(r.id, { enabled: !r.enabled });
      toast('success', r.enabled ? 'Rule disabled' : 'Rule enabled');
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) toast('info', governanceMessage(g));
      else toast('error', e instanceof Error ? e.message : 'Failed');
    }
  }
  async function onClone(r: EarnRuleRow) {
    try { await cloneEarnRule(r.id); toast('success', `Duplicated “${r.name}”`); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }
  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteEarnRule(toDelete.id);
      toast('success', `Deleted “${toDelete.name}”`);
      setToDelete(null);
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); setToDelete(null); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Earn rules"
        action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New rule</Button>}
      />

      <Card className="p-5">
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search rules…" /></div>

        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Coins size={22} />} title="No earn rules yet" hint="Create a rule to start awarding points on transactions." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New rule</Button>} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th sortKey="name" sort={sort} order={order} onSort={onSort}>Name</Th>
                  <Th>Effect</Th>
                  <Th>Type</Th>
                  <Th sortKey="priority" sort={sort} order={order} onSort={onSort}>Priority</Th>
                  <Th>Status</Th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{summarize((r.definition ?? {}) as Def)}</td>
                    <td className="px-4 py-3">{(() => { const c = ruleChannel((r.definition ?? {}) as Def); return <Badge tone={TYPE_META[c].tone}>{TYPE_META[c].label}</Badge>; })()}</td>
                    <td className="px-4 py-3">{r.priority}</td>
                    <td className="px-4 py-3"><Badge tone={r.enabled ? 'lime' : 'neutral'}>{r.enabled ? 'enabled' : 'disabled'}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <ActionMenu actions={[
                        { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
                        { label: r.enabled ? 'Disable' : 'Enable', icon: <Power size={14} />, onClick: () => toggle(r) },
                        { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => onClone(r) },
                        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(r) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? <RuleModal rule={editing === 'new' ? null : editing} types={types} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        loading={busy}
        title="Delete earn rule?"
        message={`“${toDelete?.name}” will be permanently removed.`}
      />
    </div>
  );
}

const KINDS = [
  { value: 'perAmount', label: 'Points per spend' },
  { value: 'perVisit', label: 'Points per visit' },
  { value: 'bonus', label: 'Flat bonus' },
  { value: 'multiplier', label: 'Points multiplier' },
];

function RuleModal({ rule, types, onClose, onSaved }: { rule: EarnRuleRow | null; types: { online: boolean; inStore: boolean }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const def = (rule?.definition ?? {}) as Def;
  const a0 = def.actions?.[0];
  const initialKind: Kind = (a0?.type as Kind) ?? 'perAmount';

  // Type options the brand is entitled to. Both on → can also scope to "All types".
  const bothEnabled = types.online && types.inStore;
  const channelOptions: { value: RuleChannel; label: string }[] = bothEnabled
    ? [{ value: 'both', label: 'All types (online & in-store)' }, { value: 'online', label: 'Online only (website / app)' }, { value: 'in_store', label: 'In-store only (POS terminal)' }]
    : types.online
      ? [{ value: 'online', label: 'Online (website / app)' }]
      : [{ value: 'in_store', label: 'In-store (POS terminal)' }];
  const initialChannel: RuleChannel = def.channel ?? (bothEnabled ? 'both' : types.online ? 'online' : 'in_store');

  const [name, setName] = useState(rule?.name ?? '');
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [channel, setChannel] = useState<RuleChannel>(initialChannel);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [value, setValue] = useState(String(a0?.pointsPerUnit ?? a0?.points ?? (a0?.factorBps ? a0.factorBps / 10000 : 1)));
  const [unit, setUnit] = useState(String(a0?.unitMinor ?? 100));
  const [minSpend, setMinSpend] = useState(String(def.condition?.value ?? 0));
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    setSaving(true);
    try {
      const action: Action =
        kind === 'perAmount' ? { type: 'perAmount', pointsPerUnit: Number(value), unitMinor: Number(unit) }
        : kind === 'perVisit' ? { type: 'perVisit', points: Number(value) }
        : kind === 'bonus' ? { type: 'bonus', points: Number(value) }
        : { type: 'multiplier', factorBps: Math.round(Number(value) * 10000) };
      const definition: Def = { actions: [action] };
      if (channel !== 'both') definition.channel = channel;
      if (Number(minSpend) > 0) definition.condition = { attr: 'session.amountMinor', op: 'gte', value: Number(minSpend) };

      const body = { name, priority: Number(priority), enabled, definition: definition as Record<string, unknown> };
      if (rule) await updateEarnRule(rule.id, body);
      else await createEarnRule(body);
      toast('success', rule ? 'Rule updated' : 'Rule created');
      onSaved();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); if (g.kind === 'pending') onSaved(); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={rule ? 'Edit earn rule' : 'New earn rule'} subtitle={rule ? rule.name : 'Define how members earn points'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. 1 point per AED" required error={errors.name} />
        <Select label="Applies to (loyalty type)" value={channel} onChange={(v) => setChannel(v as RuleChannel)} options={channelOptions} hint="Where this rule earns points — online, in-store, or both." />
        <Select label="Effect type" value={kind} onChange={(v) => setKind(v as Kind)} options={KINDS} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={kind === 'perAmount' ? 'Points per unit' : kind === 'multiplier' ? 'Multiplier (×)' : 'Points'}
            value={value}
            onChange={setValue}
            type="number"
          />
          {kind === 'perAmount' ? <Field label="Unit (minor, 100 = 1)" value={unit} onChange={setUnit} type="number" /> : <Field label="Priority" value={priority} onChange={setPriority} type="number" hint="Lower runs first" />}
        </div>
        {kind === 'perAmount' ? <Field label="Priority" value={priority} onChange={setPriority} type="number" hint="Lower runs first" /> : null}
        <Field label="Minimum spend to qualify (minor units)" value={minSpend} onChange={setMinSpend} type="number" hint="0 = applies to any transaction" />
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-input accent-ink" />
          Enabled
        </label>
        <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Preview: </span>
          <span className="font-medium">{summarize(buildPreview(kind, value, unit, minSpend))}</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{rule ? 'Save changes' : 'Create rule'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function buildPreview(kind: Kind, value: string, unit: string, minSpend: string): Def {
  const action: Action =
    kind === 'perAmount' ? { type: 'perAmount', pointsPerUnit: Number(value), unitMinor: Number(unit) }
    : kind === 'perVisit' ? { type: 'perVisit', points: Number(value) }
    : kind === 'bonus' ? { type: 'bonus', points: Number(value) }
    : { type: 'multiplier', factorBps: Math.round(Number(value) * 10000) };
  const def: Def = { actions: [action] };
  if (Number(minSpend) > 0) def.condition = { value: Number(minSpend) };
  return def;
}
