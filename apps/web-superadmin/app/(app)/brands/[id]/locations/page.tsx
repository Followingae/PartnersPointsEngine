'use client';

import { ArrowLeft, MapPin, Plus, Cpu, KeyRound, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  createBranch, createTerminal, deleteBranch, deleteTerminal, getBranches, getBrandRedemptionConfig, getBrandsDirectory, getTerminals,
  issueTerminalKey, setBranchStatus, setBrandRedemptionConfig, setTerminalStatus,
  type AdminBranch, type AdminTerminal, type RedemptionConfig, type TerminalKeyIssued,
} from '@/lib/api';

const TERMINAL_API_BASE = process.env.NEXT_PUBLIC_TERMINAL_API_BASE ?? 'https://api.partnerspoints.ae/v1/terminal';

export default function BrandLocationsPage() {
  const params = useParams<{ id: string }>();
  const brandId = params.id;
  const toast = useToast();
  const [brandName, setBrandName] = useState('');
  const [branches, setBranches] = useState<AdminBranch[] | null>(null);
  const [terminals, setTerminals] = useState<AdminTerminal[]>([]);
  const [newBranch, setNewBranch] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newTerminal, setNewTerminal] = useState('');
  const [termBranch, setTermBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<TerminalKeyIssued | null>(null);
  const [issuedFor, setIssuedFor] = useState<AdminTerminal | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!issued) { setQrDataUrl(null); return; }
    QRCode.toDataURL(JSON.stringify(issued.provisioning), { margin: 1, width: 280 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [issued]);

  const load = useCallback(() => Promise.all([getBranches(brandId), getTerminals(brandId)])
    .then(([b, t]) => { setBranches(b); setTerminals(t); setTermBranch((cur) => cur || b[0]?.id || ''); })
    .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')), [brandId, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getBrandsDirectory().then((rows) => setBrandName(rows.find((r) => r.id === brandId)?.name ?? '')).catch(() => {}); }, [brandId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }
  const addBranch = () => newBranch.trim() && run(async () => { await createBranch(brandId, { name: newBranch.trim(), code: newBranchCode.trim() || undefined }); setNewBranch(''); setNewBranchCode(''); toast('success', 'Branch added'); });
  const addTerminal = () => newTerminal.trim() && termBranch && run(async () => { await createTerminal(brandId, { branchId: termBranch, label: newTerminal.trim() }); setNewTerminal(''); toast('success', 'Terminal registered'); });
  const toggleBranch = (b: AdminBranch) => run(() => setBranchStatus(b.id, b.status === 'active' ? 'inactive' : 'active'));
  const toggleTerminal = (t: AdminTerminal) => run(() => setTerminalStatus(t.id, t.status === 'active' ? 'inactive' : 'active'));
  const issueKey = (t: AdminTerminal) => run(async () => {
    const key = await issueTerminalKey(t.id, TERMINAL_API_BASE);
    setIssued(key);
    setIssuedFor(t);
    toast('success', 'Key issued — previous keys revoked');
  });
  const [toDelete, setToDelete] = useState<{ kind: 'branch' | 'terminal'; id: string; name: string } | null>(null);
  const confirmDelete = () => {
    const target = toDelete;
    if (!target) return;
    run(async () => {
      if (target.kind === 'branch') await deleteBranch(target.id);
      else await deleteTerminal(target.id);
      setToDelete(null);
      toast('success', `Deleted “${target.name}”`);
    });
  };

  const activeBranches = branches?.filter((b) => b.status === 'active').length ?? 0;

  return (
    <div>
      <Link href="/brands" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft size={15} /> Back to Brands</Link>
      <PageHeader
        subtitle={brandName || 'Brand'}
        title="Branches & terminals"
        action={branches ? <Badge tone="teal">{activeBranches} active · {terminals.length} terminals</Badge> : null}
      />

      <BrandValuationCard brandId={brandId} />

      {!branches ? (
        <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Branches */}
          <Card className="p-5">
            <SectionTitle>Branches</SectionTitle>
            {branches.length === 0 ? (
              <EmptyState icon={<MapPin size={20} />} title="No branches yet" hint="Add a branch to start registering POS terminals." />
            ) : (
              <div className="space-y-2">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.terminals} terminal{b.terminals === 1 ? '' : 's'}{b.code ? ` · ${b.code}` : ''}{b.timezone ? ` · ${b.timezone}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button disabled={busy} onClick={() => toggleBranch(b)} title="Toggle status"><Badge tone={b.status === 'active' ? 'lime' : 'neutral'}>{b.status}</Badge></button>
                      <button
                        disabled={busy}
                        onClick={() => setToDelete({ kind: 'branch', id: b.id, name: b.name })}
                        title="Delete branch"
                        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      ><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 space-y-2 rounded-2xl bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a branch</p>
              <Field label="" value={newBranch} onChange={setNewBranch} placeholder="Branch name (e.g. Dubai Mall)" />
              <div className="flex gap-2">
                <Field label="" value={newBranchCode} onChange={setNewBranchCode} placeholder="Code (optional)" />
                <Button variant="outline" onClick={addBranch} loading={busy}><Plus size={14} /> Add</Button>
              </div>
            </div>
          </Card>

          {/* Terminals */}
          <Card className="p-5">
            <SectionTitle>POS terminals</SectionTitle>
            {terminals.length === 0 ? (
              <EmptyState icon={<Cpu size={20} />} title="No terminals yet" hint={branches.length ? 'Register a terminal against a branch.' : 'Add a branch first.'} />
            ) : (
              <div className="space-y-2">
                {terminals.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.branchName} · {t.pairedAt ? 'paired' : 'not paired'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => issueKey(t)} loading={busy}><KeyRound size={13} /> Issue key</Button>
                      <button disabled={busy} onClick={() => toggleTerminal(t)} title="Toggle status"><Badge tone={t.status === 'active' ? 'lime' : 'neutral'}>{t.status}</Badge></button>
                      <button
                        disabled={busy}
                        onClick={() => setToDelete({ kind: 'terminal', id: t.id, name: t.label })}
                        title="Delete terminal"
                        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      ><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {branches.length ? (
              <div className="mt-4 space-y-2 rounded-2xl bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Register a terminal</p>
                <Select label="" value={termBranch} onChange={setTermBranch} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
                <div className="flex gap-2">
                  <Field label="" value={newTerminal} onChange={setNewTerminal} placeholder="Terminal label (e.g. Till 1)" />
                  <Button variant="outline" onClick={addTerminal} loading={busy}><Plus size={14} /> Add</Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      <Modal
        open={issued !== null}
        onClose={() => { setIssued(null); setIssuedFor(null); }}
        title="Terminal key issued"
        subtitle={issuedFor ? `${issuedFor.label} · ${issuedFor.branchName}` : undefined}
      >
        {issued ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR on the terminal app&apos;s pairing screen. The secret is shown <span className="font-semibold text-foreground">once</span> — issuing again revokes it.
            </p>
            {qrDataUrl ? (
              <div className="flex justify-center rounded-2xl border border-border/70 bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Terminal provisioning QR" className="h-[280px] w-[280px]" />
              </div>
            ) : null}
            <div className="space-y-2 rounded-2xl bg-muted/40 p-3 font-mono text-xs">
              <p><span className="text-muted-foreground">key&nbsp;&nbsp;&nbsp;&nbsp;</span>{issued.publishableId}</p>
              <p className="break-all"><span className="text-muted-foreground">secret&nbsp;</span>{issued.secret}</p>
              <p className="break-all"><span className="text-muted-foreground">api&nbsp;&nbsp;&nbsp;&nbsp;</span>{TERMINAL_API_BASE}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard?.writeText(JSON.stringify(issued.provisioning)); toast('success', 'Provisioning JSON copied'); }}
            >
              Copy provisioning JSON
            </Button>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={toDelete?.kind === 'branch' ? 'Delete branch?' : 'Delete terminal?'}
        message={`“${toDelete?.name ?? ''}” will be removed permanently. Anything with transaction history can't be deleted — deactivate it instead.`}
      />
    </div>
  );
}

/**
 * Platform-owned "pay with points" valuation for this brand. RFM operates the
 * loyalty economics; the brand console shows this read-only.
 */
function BrandValuationCard({ brandId }: { brandId: string }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<RedemptionConfig | null>(null);
  const [ratePoints, setRatePoints] = useState('100');
  const [rateValue, setRateValue] = useState('1.00');
  const [minPoints, setMinPoints] = useState('0');
  const [maxPercent, setMaxPercent] = useState('100');
  const [rounding, setRounding] = useState('1');
  const [presets, setPresets] = useState('500, 1000, 2000');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBrandRedemptionConfig(brandId)
      .then((c) => {
        setCfg(c);
        setRatePoints(c.ratePoints);
        setRateValue((Number(c.rateValueMinor) / 100).toFixed(2));
        setMinPoints(c.minRedeemPoints);
        setMaxPercent(String(c.maxPercentOfBillBps / 100));
        setRounding(String(c.roundToMinor));
        setPresets(c.presetsPoints.join(', '));
      })
      .catch(() => setCfg(null));
  }, [brandId]);

  async function save(enabledOverride?: boolean) {
    setSaving(true);
    try {
      const next = await setBrandRedemptionConfig(brandId, {
        ...(enabledOverride !== undefined ? { enabled: enabledOverride } : {}),
        ratePoints: Math.max(1, Math.round(Number(ratePoints) || 100)),
        rateValueMinor: Math.max(0, Math.round((Number(rateValue) || 0) * 100)),
        minRedeemPoints: Math.max(0, Math.round(Number(minPoints) || 0)),
        maxPercentOfBillBps: Math.min(10000, Math.max(0, Math.round((Number(maxPercent) || 0) * 100))),
        roundToMinor: Math.max(1, Math.round(Number(rounding) || 1)),
        presetsPoints: presets.split(',').map((s) => Math.round(Number(s.trim()))).filter((n) => Number.isFinite(n) && n > 0),
      });
      setCfg(next);
      toast('success', 'Valuation saved — terminals and the brand console pick it up on next sync');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight">Pay with points</h3>
          <p className="text-sm text-muted-foreground">
            Platform-set valuation · {ratePoints || '—'} pts = AED {rateValue || '—'} · brands see this read-only
          </p>
        </div>
        {cfg ? (
          <button disabled={saving} onClick={() => save(!cfg.enabled)} title={cfg.enabled ? 'Disable POS redemptions' : 'Enable POS redemptions'}>
            <Badge tone={cfg.enabled ? 'lime' : 'neutral'}>{cfg.enabled ? 'Enabled' : 'Disabled'}</Badge>
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Points" value={ratePoints} onChange={setRatePoints} placeholder="100" hint="This many points…" />
        <Field label="= AED" value={rateValue} onChange={setRateValue} placeholder="1.00" hint="…are worth this much" />
        <Field label="Min points" value={minPoints} onChange={setMinPoints} placeholder="0" hint="Smallest redemption" />
        <Field label="Max % of bill" value={maxPercent} onChange={setMaxPercent} placeholder="100" hint="Points-payable share" />
        <Field label="Round to (fils)" value={rounding} onChange={setRounding} placeholder="25" hint="Discount rounding" />
        <Field label="POS presets" value={presets} onChange={setPresets} placeholder="500, 1000" hint="Quick-pick chips" />
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => save()} loading={saving}>Save valuation</Button>
      </div>
    </Card>
  );
}
