'use client';

import { Copy, Megaphone, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader } from '@/components/form';
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

function CampaignModal({ campaign, onClose, onSaved }: { campaign: CampaignRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const existingDef = (campaign?.definition ?? {}) as { actions?: Array<{ type?: string; points?: number }>; condition?: { value?: number } };
  const [name, setName] = useState(campaign?.name ?? '');
  const [bonus, setBonus] = useState(String(existingDef.actions?.[0]?.points ?? 25));
  const [minSpend, setMinSpend] = useState(String(existingDef.condition?.value ?? 5000));
  const [startsAt, setStartsAt] = useState(toDateInput(campaign?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(campaign?.endsAt ?? null));
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    setSaving(true);
    try {
      const definition: Record<string, unknown> = { actions: [{ type: 'bonus', points: Number(bonus) }] };
      if (Number(minSpend) > 0) definition.condition = { attr: 'session.amountMinor', op: 'gte', value: Number(minSpend) };
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
    <Modal open onClose={onClose} title={campaign ? 'Edit campaign' : 'New campaign'} subtitle={campaign ? campaign.name : 'Time-boxed bonus campaign'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Weekend Bonus" required error={errors.name} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bonus points" value={bonus} onChange={setBonus} type="number" />
          <Field label="Min spend (minor units)" value={minSpend} onChange={setMinSpend} type="number" hint="0 = any spend" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" value={startsAt} onChange={setStartsAt} type="date" hint="Blank = immediately" />
          <Field label="Ends" value={endsAt} onChange={setEndsAt} type="date" hint="Blank = open-ended" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{campaign ? 'Save changes' : 'Create campaign'}</Button>
        </div>
      </div>
    </Modal>
  );
}
