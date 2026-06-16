'use client';

import { LayoutGrid, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, EmptyState, StatHero, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getBrandGovernance, getBrandModules, getBrands, getGovernanceStats, setBrandGovernance, setBrandModules, type BrandModules, type GovernanceConfig, type GovernanceStats } from '@/lib/api';

const MODE_LABEL: Record<string, string> = {
  autonomous: 'Autonomous',
  approval_required: 'Approval required',
  superadmin_managed: 'Platform-managed',
};
const MODE_TONE: Record<string, 'lime' | 'teal' | 'coral'> = { autonomous: 'lime', approval_required: 'teal', superadmin_managed: 'coral' };
const MODE_OPTIONS = [
  { value: 'autonomous', label: 'Autonomous — brand edits directly' },
  { value: 'approval_required', label: 'Approval required — edits queue for review' },
  { value: 'superadmin_managed', label: 'Platform-managed — brand is read-only' },
];

interface BrandRow { id: string; name: string; slug: string }

export default function GovernancePage() {
  const toast = useToast();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [modes, setModes] = useState<Record<string, GovernanceConfig>>({});
  const [stats, setStats] = useState<GovernanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GovernanceConfig | null>(null);
  const [editingModules, setEditingModules] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bs, st] = await Promise.all([getBrands(), getGovernanceStats()]);
      setBrands(bs);
      setStats(st);
      const cfgs = await Promise.all(bs.map((b) => getBrandGovernance(b.id).catch(() => null)));
      const map: Record<string, GovernanceConfig> = {};
      cfgs.forEach((c) => { if (c) map[c.brandId] = c; });
      setModes(map);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader subtitle="Platform · Governance" title="Governance" />

      {stats ? (
        <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatHero label="Pending" value={String(stats.pending)} gradient="teal" icon={<ShieldCheck size={16} />} />
          <StatHero label="Approved" value={String(stats.approved)} gradient="lime" icon={<ShieldCheck size={16} />} />
          <StatHero label="Rejected" value={String(stats.rejected)} gradient="coral" icon={<ShieldCheck size={16} />} />
          <StatHero label="Approval rate" value={stats.approvalRate === null ? '—' : `${stats.approvalRate}`} unit={stats.approvalRate === null ? '' : '%'} gradient="ink" icon={<ShieldCheck size={16} />} />
        </section>
      ) : null}

      <Card className="p-5">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : brands.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="No brands yet" hint="Onboard a merchant and create brands to govern them." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Brand</th>
                  <th className="px-4 py-3 font-semibold">Default mode</th>
                  <th className="px-4 py-3 font-semibold">Overrides</th>
                  <th className="px-4 py-3 text-right font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {brands.map((b) => {
                  const cfg = modes[b.id];
                  const mode = cfg?.defaultMode ?? 'autonomous';
                  return (
                    <tr key={b.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{b.name}</td>
                      <td className="px-4 py-3"><Badge tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{cfg?.overrides.length ? `${cfg.overrides.length} capability override(s)` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingModules(b.id)}><LayoutGrid size={14} /> Modules</Button>
                          {cfg ? <Button size="sm" variant="outline" onClick={() => setEditing(cfg)}><SlidersHorizontal size={14} /> Governance</Button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? <GovernanceModal cfg={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null}
      {editingModules ? <ModulesModal brandId={editingModules} onClose={() => setEditingModules(null)} /> : null}
    </div>
  );
}

function GovernanceModal({ cfg, onClose, onSaved }: { cfg: GovernanceConfig; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [defaultMode, setDefaultMode] = useState(cfg.defaultMode);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const cap of cfg.capabilities) m[cap] = cfg.overrides.find((o) => o.entityType === cap)?.mode ?? 'inherit';
    return m;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const ov = Object.entries(overrides).map(([entityType, mode]) => ({ entityType, mode }));
      await setBrandGovernance(cfg.brandId, { defaultMode, overrides: ov });
      toast('success', 'Governance updated');
      onSaved();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`Governance — ${cfg.name}`} subtitle="Set the brand default and optional per-capability overrides">
      <div className="space-y-5">
        <Select label="Brand default mode" value={defaultMode} onChange={(v) => setDefaultMode(v as GovernanceConfig['defaultMode'])} options={MODE_OPTIONS} />
        <div>
          <p className="mb-2 text-sm font-medium">Per-capability overrides</p>
          <div className="space-y-2">
            {cfg.capabilities.map((cap) => (
              <div key={cap} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-2.5">
                <span className="text-sm font-medium capitalize">{cap.replace(/_/g, ' ')}</span>
                <select
                  value={overrides[cap]}
                  onChange={(e) => setOverrides((o) => ({ ...o, [cap]: e.target.value }))}
                  className="rounded-xl border border-input bg-white px-3 py-1.5 text-sm outline-none focus:border-ink focus:ring-4 focus:ring-primary/30"
                >
                  <option value="inherit">Inherit default</option>
                  <option value="autonomous">Autonomous</option>
                  <option value="approval_required">Approval required</option>
                  <option value="superadmin_managed">Platform-managed</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save governance</Button>
        </div>
      </div>
    </Modal>
  );
}

function ModulesModal({ brandId, onClose }: { brandId: string; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<BrandModules | null>(null);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBrandModules(brandId).then((d) => { setData(d); setAccess(d.access); }).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [brandId, toast]);

  const enabled = (key: string) => access[key] !== false; // absent = on
  const toggle = (key: string) => setAccess((a) => ({ ...a, [key]: !enabled(key) }));

  async function save() {
    setSaving(true);
    try {
      await setBrandModules(brandId, access);
      toast('success', 'Module access updated');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`Module access — ${data?.name ?? ''}`} subtitle="Choose which modules this brand can see and use">
      {!data ? (
        <TableSkeleton rows={6} cols={2} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {data.modules.map((m) => (
              <label key={m.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3">
                <span className="text-sm font-medium">{m.label}</span>
                <button
                  type="button"
                  onClick={() => toggle(m.key)}
                  className={`relative h-6 w-11 rounded-full transition ${enabled(m.key) ? 'bg-ink' : 'bg-muted'}`}
                  aria-pressed={enabled(m.key)}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled(m.key) ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Disabled modules are hidden from the brand console. Core modules (dashboard, customers, members, earn rules, rewards, settings) are always available.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
