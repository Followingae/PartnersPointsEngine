'use client';

import { ArrowDownRight, ArrowUpRight, Ban, Building2, CirclePlus, Pencil, PlayCircle, Plus, Scale, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, Select } from '@/components/form';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { BackLink, DetailHeader, TabBar, type TabDef } from '@/components/detail-shell';
import { useToast } from '@/components/toast';
import {
  createBrand, getGroup, getWalletLedger, manageBrand, setCostRule, setGroupStatus, topUpWallet, updateGroup,
  uuid, type GroupDetail, type WalletEntry,
} from '@/lib/api';

const money = (minor: string, currency = 'AED') => `${currency} ${(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = 'overview' | 'wallet' | 'cost' | 'brands' | 'governance';

/** Full-page Merchant 360 (replaces the old drawer). */
export function MerchantDetailView({ groupId }: { groupId: string }) {
  const toast = useToast();
  const [g, setG] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'edit' | 'topup' | 'cost' | 'brand' | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getGroup(groupId)
      .then(setG)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [groupId, toast]);

  useEffect(() => load(), [load]);

  async function doStatus() {
    if (!g) return;
    setBusy(true);
    try {
      await setGroupStatus(g.id, g.status === 'suspended' ? 'active' : 'suspended');
      toast('success', g.status === 'suspended' ? 'Merchant reactivated' : 'Merchant suspended');
      setConfirmSuspend(false);
      load();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'wallet', label: 'Wallet' },
    { key: 'cost', label: 'Cost rules' },
    { key: 'brands', label: 'Brands', count: g?.brands.length },
    { key: 'governance', label: 'Governance' },
  ];

  return (
    <div>
      <BackLink href="/merchants" label="Merchants" />
      {loading || !g ? (
        <Card className="p-6"><Skeleton className="h-72 w-full" /></Card>
      ) : (
        <>
          <DetailHeader
            subtitle="Merchant"
            title={g.name}
            badge={<Badge tone={g.status === 'active' ? 'lime' : 'neutral'}>{g.status}</Badge>}
            actions={
              <>
                <Button size="sm" onClick={() => setModal('topup')}><CirclePlus size={15} /> Top up</Button>
                <Button size="sm" variant="outline" onClick={() => setModal('edit')}><Pencil size={15} /> Edit</Button>
                <Button size="sm" variant={g.status === 'suspended' ? 'primary' : 'danger'} onClick={() => setConfirmSuspend(true)}>
                  {g.status === 'suspended' ? <><PlayCircle size={15} /> Reactivate</> : <><Ban size={15} /> Suspend</>}
                </Button>
              </>
            }
          />

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-gradient-teal p-5 text-ink shadow-hero">
              <p className="text-xs font-semibold opacity-75">Wallet available</p>
              <p className="mt-3 font-display text-2xl font-bold leading-none">{money(g.wallet.available, g.currency)}</p>
            </div>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Wallet pending</p><p className="mt-3 font-display text-2xl font-bold leading-none">{money(g.wallet.pending, g.currency)}</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Points liability</p><p className="mt-3 font-display text-2xl font-bold leading-none">{Number(g.pointsLiability).toLocaleString()}</p></Card>
          </section>

          <TabBar tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />

          <Card className="p-6">
            {tab === 'overview' ? (
              <dl className="space-y-2.5 text-sm">
                <Row k="Status" v={<Badge tone={g.status === 'active' ? 'lime' : 'neutral'}>{g.status}</Badge>} />
                <Row k="Currency" v={g.currency} />
                <Row k="Home region" v={g.homeRegion.toUpperCase()} />
                <Row k="Brands" v={g.brands.length} />
                <Row k="Low-balance alert" v={money(g.wallet.lowBalanceThreshold, g.currency)} />
                <Row k="Onboarded" v={new Date(g.createdAt).toLocaleDateString()} />
              </dl>
            ) : tab === 'wallet' ? (
              <WalletTab groupId={g.id} currency={g.currency} />
            ) : tab === 'cost' ? (
              <CostTab g={g} onUpdate={() => setModal('cost')} />
            ) : tab === 'brands' ? (
              <BrandsTab g={g} onAdd={() => setModal('brand')} />
            ) : (
              <GovernanceTab g={g} />
            )}
          </Card>
        </>
      )}

      {g && modal === 'topup' ? <TopUpModal g={g} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} /> : null}
      {g && modal === 'edit' ? <EditModal g={g} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} /> : null}
      {g && modal === 'cost' ? <CostModal g={g} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} /> : null}
      {g && modal === 'brand' ? <BrandModal g={g} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} /> : null}

      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={doStatus}
        loading={busy}
        tone={g?.status === 'suspended' ? 'primary' : 'danger'}
        title={g?.status === 'suspended' ? 'Reactivate merchant?' : 'Suspend merchant?'}
        message={g?.status === 'suspended' ? `Restore access for “${g?.name}”.` : `Suspend “${g?.name}”. Their wallet and programs are frozen until reactivated.`}
        confirmLabel={g?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
      />
    </div>
  );
}

function GovernanceTab({ g }: { g: GroupDetail }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Maker-checker mode is set per brand. Configure each brand&apos;s default and per-capability modes in the Governance console.</p>
      {g.brands.map((b) => (
        <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-lime text-ink"><Scale size={16} /></span>
          <span className="flex-1 font-semibold">{b.name}</span>
          <Link href="/governance" className="text-sm font-semibold text-[#0f6b66] hover:underline">Configure →</Link>
        </div>
      ))}
      {g.brands.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="No brands to govern" /> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>;
}

function WalletTab({ groupId, currency }: { groupId: string; currency: string }) {
  const [rows, setRows] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getWalletLedger(groupId, { limit: 25 }).then((r) => setRows(r.rows)).catch(() => {}).finally(() => setLoading(false));
  }, [groupId]);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!rows.length) return <EmptyState icon={<Wallet size={20} />} title="No wallet activity" hint="Top-ups and drawdowns appear here." />;
  return (
    <ul className="divide-y divide-border/70">
      {rows.map((t) => {
        const credit = t.direction === 'credit';
        return (
          <li key={t.journalId} className="flex items-center gap-3 py-2.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full ${credit ? 'bg-lime-200 text-lime-900' : 'bg-coral/20 text-[#9b3b52]'}`}>
              {credit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium capitalize">{t.kind.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground">{new Date(t.occurredAt).toLocaleString()}</p>
            </div>
            <span className={`font-display font-semibold ${credit ? 'text-[#1f7a3d]' : 'text-[#9b3b52]'}`}>{credit ? '+' : '−'}{money(t.amount, currency)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CostTab({ g, onUpdate }: { g: GroupDetail; onUpdate: () => void }) {
  const c = g.costRule;
  return (
    <div className="space-y-4">
      {c ? (
        <dl className="space-y-2.5 text-sm">
          <Row k="Cost / point redeemed" v={money(c.costPerPointMinor, g.currency)} />
          <Row k="Issuance fee / point" v={money(c.issuanceFeeMinor, g.currency)} />
          <Row k="Platform margin" v={`${(c.platformMarginBps / 100).toFixed(2)}%`} />
          <Row k="Breakage owner" v={<span className="capitalize">{c.breakageOwner}</span>} />
          <Row k="Effective from" v={new Date(c.effectiveFrom).toLocaleDateString()} />
        </dl>
      ) : (
        <EmptyState title="No cost rule set" hint="Define the drawdown cost model for this merchant." />
      )}
      <Button size="sm" variant="outline" onClick={onUpdate}><Pencil size={15} /> {c ? 'Update cost rule' : 'Set cost rule'}</Button>
    </div>
  );
}

function BrandsTab({ g, onAdd }: { g: GroupDetail; onAdd: () => void }) {
  const toast = useToast();
  return (
    <div className="space-y-3">
      {g.brands.length === 0 ? (
        <EmptyState icon={<Building2 size={20} />} title="No brands yet" hint="Add the first loyalty program for this merchant." />
      ) : (
        g.brands.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-lime text-ink"><Building2 size={16} /></span>
            <div className="flex-1">
              <p className="font-semibold">{b.name}</p>
              <p className="text-xs text-muted-foreground">{b.members.toLocaleString()} members · {b.currency}</p>
            </div>
            <Badge tone={b.status === 'active' ? 'lime' : 'neutral'}>{b.status}</Badge>
            <Button size="sm" variant="outline" onClick={() => manageBrand(b.id).catch(() => toast('error', 'Failed to open brand'))}>Manage</Button>
          </div>
        ))
      )}
      <Button size="sm" variant="outline" onClick={onAdd}><Plus size={15} /> Add brand</Button>
    </div>
  );
}

function TopUpModal({ g, onClose, onDone }: { g: GroupDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('1000');
  const [saving, setSaving] = useState(false);
  async function submit() {
    const major = Number(amount);
    if (!(major > 0)) { toast('error', 'Enter an amount greater than 0'); return; }
    setSaving(true);
    try {
      await topUpWallet(g.id, { amountMinor: Math.round(major * 100), currency: g.currency, idempotencyKey: uuid() });
      toast('success', `Credited ${g.currency} ${major.toLocaleString()}`);
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Top up wallet" subtitle={g.name}>
      <div className="space-y-4">
        <Field label={`Amount (${g.currency})`} value={amount} onChange={setAmount} type="number" hint="Prepaid credit added to the merchant wallet" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Credit wallet</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ g, onClose, onDone }: { g: GroupDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(g.name);
  const [lowBal, setLowBal] = useState(String(Number(g.wallet.lowBalanceThreshold) / 100));
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      await updateGroup(g.id, { name, lowBalanceThreshold: Math.round(Number(lowBal) * 100) });
      toast('success', 'Merchant updated');
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit merchant" subtitle={g.name}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} required />
        <Field label={`Low-balance alert threshold (${g.currency})`} value={lowBal} onChange={setLowBal} type="number" hint="Warn when available wallet drops below this" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}

const BREAKAGE = [
  { value: 'merchant', label: 'Merchant' },
  { value: 'platform', label: 'Platform' },
  { value: 'split', label: 'Split' },
];

function CostModal({ g, onClose, onDone }: { g: GroupDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const c = g.costRule;
  const [cpp, setCpp] = useState(c ? String(Number(c.costPerPointMinor) / 100) : '0.05');
  const [issuance, setIssuance] = useState(c ? String(Number(c.issuanceFeeMinor) / 100) : '0');
  const [margin, setMargin] = useState(c ? String(c.platformMarginBps / 100) : '10');
  const [owner, setOwner] = useState(c?.breakageOwner ?? 'merchant');
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      await setCostRule(g.id, {
        costPerPointMinor: Math.round(Number(cpp) * 100),
        issuanceFeeMinor: Math.round(Number(issuance) * 100),
        platformMarginBps: Math.round(Number(margin) * 100),
        breakageOwner: owner,
      });
      toast('success', 'Cost rule saved');
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Cost rule" subtitle={g.name}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cost / point (${g.currency})`} value={cpp} onChange={setCpp} type="number" hint="On redemption" />
          <Field label={`Issuance fee (${g.currency})`} value={issuance} onChange={setIssuance} type="number" hint="On earn" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform margin (%)" value={margin} onChange={setMargin} type="number" />
          <Select label="Breakage owner" value={owner} onChange={setOwner} options={BREAKAGE} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save cost rule</Button>
        </div>
      </div>
    </Modal>
  );
}

function BrandModal({ g, onClose, onDone }: { g: GroupDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [saving, setSaving] = useState(false);
  async function submit() {
    const e: { name?: string; slug?: string } = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!/^[a-z0-9-]+$/.test(slug)) e.slug = 'Lowercase letters, numbers, hyphens';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await createBrand(g.id, { name, slug, currency: g.currency });
      toast('success', `Brand “${name}” created`);
      onDone();
    } catch (err) { toast('error', err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add brand" subtitle={g.name}>
      <div className="space-y-4">
        <Field label="Brand name" value={name} onChange={(v) => { setName(v); if (!slug) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} required error={errors.name} />
        <Field label="Slug" value={slug} onChange={setSlug} hint="Used in URLs and the points namespace" required error={errors.slug} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create brand</Button>
        </div>
      </div>
    </Modal>
  );
}
