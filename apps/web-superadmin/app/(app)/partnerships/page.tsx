'use client';

import { Download, Handshake, Inbox, Plus, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, SectionTitle, Skeleton, StatHero } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  confirmTopup, enableMerchant, ensureLulu, fundAllowance, getBrandsDirectory, getPartnerConversions, getPartnerMerchants,
  getPartnerOverview, getPartners, getTopupRequests, invoiceTopup, rejectTopup, updatePartnerMerchant, downloadPartnerConversionsCsv,
  type BrandDirectoryRow, type ConversionRow, type PartnerMerchantRow, type PartnerOverview, type PartnerSummary, type TopupRequest,
} from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();
const when = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

const TOPUP_TONE: Record<TopupRequest['status'], 'coral' | 'teal' | 'lime' | 'neutral'> = {
  pending: 'coral', invoiced: 'teal', confirmed: 'lime', rejected: 'neutral',
};

export default function PartnershipsPage() {
  const toast = useToast();
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerSummary | null>(null);
  const [overview, setOverview] = useState<PartnerOverview | null>(null);
  const [merchants, setMerchants] = useState<PartnerMerchantRow[]>([]);
  const [conversions, setConversions] = useState<ConversionRow[]>([]);
  const [topups, setTopups] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [funding, setFunding] = useState<PartnerMerchantRow | null>(null);
  const [action, setAction] = useState<{ req: TopupRequest; mode: 'invoice' | 'confirm' | 'reject' } | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      await ensureLulu();
      const partners = await getPartners();
      const lulu = partners.find((p) => p.key === 'lulu') ?? partners[0];
      setPartner(lulu);
      if (lulu) {
        const [ov, ms, cv, tu] = await Promise.all([
          getPartnerOverview(lulu.id), getPartnerMerchants(lulu.id), getPartnerConversions(lulu.id), getTopupRequests(),
        ]);
        setOverview(ov); setMerchants(ms); setConversions(cv); setTopups(tu);
      }
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function toggleMerchant(m: PartnerMerchantRow) {
    try { await updatePartnerMerchant(m.id, { status: m.status === 'active' ? 'inactive' : 'active' }); toast('success', 'Updated'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  async function exportCsv() {
    if (!partner) return;
    setExporting(true);
    try { await downloadPartnerConversionsCsv(partner.id); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Export failed'); }
    finally { setExporting(false); }
  }

  if (loading) return <div><PageHeader subtitle="Platform" title="Partnerships" /><Card className="p-6"><Skeleton className="h-72 w-full" /></Card></div>;

  const pendingCount = topups.filter((t) => t.status === 'pending').length;

  return (
    <div>
      <PageHeader
        subtitle="Platform"
        title="Partnerships"
        action={partner ? <Badge tone={partner.connectorMode === 'live' ? 'lime' : 'coral'}>{partner.connectorMode.toUpperCase()}</Badge> : null}
      />

      {partner ? (
        <div className="space-y-6">
          {/* partner header */}
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-coral text-ink"><Handshake size={22} /></span>
              <div>
                <p className="font-display text-xl font-bold leading-tight">{partner.name}</p>
                <p className="text-sm text-muted-foreground">Customers convert merchant points → {partner.currencyName}</p>
              </div>
            </div>
          </Card>

          {/* overview KPIs */}
          {overview ? (
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatHero gradient="teal" label="Conversions (30d)" value={num(overview.conversions)} />
              <StatHero gradient="lime" label={`${partner.currencyName} issued`} value={num(overview.partnerIssued)} />
              <StatHero gradient="coral" label="Allowance spent (30d)" value={aed(overview.allowanceSpent)} />
              <StatHero gradient="ink" label="Allowance outstanding" value={aed(overview.allowanceOutstanding)} delta={`${overview.activeMerchants} active · ${overview.successRate}% success`} />
            </section>
          ) : null}

          {/* top-up requests — the funding queue */}
          <TopupQueue
            topups={topups}
            pendingCount={pendingCount}
            onAction={(req, mode) => setAction({ req, mode })}
          />

          {/* enabled merchants */}
          <Card className="p-5">
            <SectionTitle action={<Button size="sm" onClick={() => setEnabling(true)}><Plus size={15} /> Enable a merchant</Button>}>Enabled merchants</SectionTitle>
            {merchants.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No merchants enabled yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">Brand</th><th className="px-4 py-3 font-semibold">Ratio</th><th className="px-4 py-3 font-semibold">Allowance</th><th className="px-4 py-3 font-semibold">Conversions</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {merchants.map((m) => {
                      const low = Number(m.allowanceBalance) <= Number(m.lowBalanceThreshold);
                      return (
                        <tr key={m.id} className="hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{m.brandName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{(m.ratioBps / 10000).toFixed(2)}× </td>
                          <td className="px-4 py-3"><span className={low ? 'font-semibold text-[#9b3b52]' : ''}>{aed(m.allowanceBalance)}</span>{low ? <span className="ml-1 text-xs text-[#9b3b52]">low</span> : null}</td>
                          <td className="px-4 py-3">{num(m.conversions)}</td>
                          <td className="px-4 py-3"><Badge tone={m.status === 'active' ? 'lime' : 'neutral'}>{m.status === 'active' ? 'active' : 'paused'}</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setFunding(m)}><Wallet size={14} /> Fund</Button>
                              <Button size="sm" variant="outline" onClick={() => toggleMerchant(m)}>{m.status === 'active' ? 'Pause' : 'Resume'}</Button>
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

          {/* conversions / reconciliation */}
          <Card className="p-5">
            <SectionTitle action={conversions.length ? <Button size="sm" variant="outline" onClick={exportCsv} loading={exporting}><Download size={14} /> Export CSV</Button> : undefined}>Recent conversions</SectionTitle>
            {conversions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No conversions yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Merchant pts</th><th className="px-4 py-3 font-semibold">{partner.currencyName}</th><th className="px-4 py-3 font-semibold">Cost</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Ref</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {conversions.map((c) => (
                      <tr key={c.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/partnerships/conversions/${c.id}`)}>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">{num(c.sourcePoints)}</td>
                        <td className="px-4 py-3 font-semibold">{num(c.partnerPoints)}</td>
                        <td className="px-4 py-3">{aed(c.allowanceCostMinor)}</td>
                        <td className="px-4 py-3"><Badge tone={c.status === 'completed' ? 'lime' : c.status === 'failed' ? 'coral' : 'neutral'}>{c.status}</Badge></td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.partnerTxnRef ?? c.failureReason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {enabling && partner ? <EnableModal partnerId={partner.id} onClose={() => setEnabling(false)} onDone={() => { setEnabling(false); load(); }} /> : null}
      {funding && partner ? <FundModal partnerId={partner.id} merchant={funding} onClose={() => setFunding(null)} onDone={() => { setFunding(null); load(); }} /> : null}
      {action ? <TopupActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} /> : null}
    </div>
  );
}

function TopupQueue({ topups, pendingCount, onAction }: { topups: TopupRequest[]; pendingCount: number; onAction: (req: TopupRequest, mode: 'invoice' | 'confirm' | 'reject') => void }) {
  return (
    <Card className="p-5">
      <SectionTitle action={pendingCount ? <Badge tone="coral">{pendingCount} awaiting</Badge> : undefined}>Allowance top-up requests</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">Merchants request top-ups here. Invoice them, then confirm payment to credit their prepaid allowance.</p>
      {topups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground"><Inbox size={22} /> No top-up requests yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3 font-semibold">Requested</th><th className="px-4 py-3 font-semibold">Brand</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {topups.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 text-muted-foreground">{when(t.createdAt)}{t.note ? <span className="block text-xs italic">“{t.note}”</span> : null}</td>
                  <td className="px-4 py-3 font-medium">{t.brandName}</td>
                  <td className="px-4 py-3 font-display font-semibold">{aed(t.amountMinor)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.invoiceRef ?? '—'}</td>
                  <td className="px-4 py-3"><Badge tone={TOPUP_TONE[t.status]}>{t.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {t.status === 'pending' ? <Button size="sm" variant="ghost" onClick={() => onAction(t, 'invoice')}>Mark invoiced</Button> : null}
                      {(t.status === 'pending' || t.status === 'invoiced') ? <Button size="sm" onClick={() => onAction(t, 'confirm')}>Confirm payment</Button> : null}
                      {(t.status === 'pending' || t.status === 'invoiced') ? <Button size="sm" variant="outline" onClick={() => onAction(t, 'reject')}>Reject</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TopupActionModal({ action, onClose, onDone }: { action: { req: TopupRequest; mode: 'invoice' | 'confirm' | 'reject' }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { req, mode } = action;
  const [invoiceRef, setInvoiceRef] = useState(req.invoiceRef ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      if (mode === 'invoice') { await invoiceTopup(req.id, invoiceRef || undefined); toast('success', 'Marked invoiced'); }
      else if (mode === 'confirm') { await confirmTopup(req.id); toast('success', 'Payment confirmed — allowance credited'); }
      else { await rejectTopup(req.id, reason || undefined); toast('success', 'Request rejected'); }
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  const title = mode === 'invoice' ? 'Mark as invoiced' : mode === 'confirm' ? 'Confirm payment' : 'Reject request';
  return (
    <Modal open onClose={onClose} title={title} subtitle={`${req.brandName} · ${aed(req.amountMinor)}`}>
      <div className="space-y-4">
        {mode === 'invoice' ? (
          <Field label="Invoice reference" value={invoiceRef} onChange={setInvoiceRef} placeholder="e.g. INV-2026-0042" hint="Optional — shown to the merchant." />
        ) : mode === 'confirm' ? (
          <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Confirm that <span className="font-semibold text-foreground">{aed(req.amountMinor)}</span> has been received. This immediately credits {req.brandName}’s prepaid allowance wallet.</p>
        ) : (
          <Field label="Reason" value={reason} onChange={setReason} placeholder="Optional note for the merchant" />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{mode === 'confirm' ? 'Confirm & credit' : mode === 'invoice' ? 'Mark invoiced' : 'Reject'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function EnableModal({ partnerId, onClose, onDone }: { partnerId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [brands, setBrands] = useState<BrandDirectoryRow[]>([]);
  const [brandId, setBrandId] = useState('');
  const [ratio, setRatio] = useState('10000');
  const [threshold, setThreshold] = useState('5000');
  const [maxDay, setMaxDay] = useState('0');
  const [saving, setSaving] = useState(false);
  useEffect(() => { getBrandsDirectory().then((b) => { setBrands(b); if (b[0]) setBrandId(b[0].id); }).catch(() => {}); }, []);
  async function submit() {
    if (!brandId) return;
    setSaving(true);
    try { await enableMerchant(partnerId, { brandId, ratioBps: Number(ratio), maxConversionPerDay: Number(maxDay), lowBalanceThresholdMinor: Number(threshold) }); toast('success', 'Merchant enabled'); onDone(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Enable a merchant" subtitle="Turn on Lulu conversions for a brand">
      <div className="space-y-4">
        <Select label="Brand" value={brandId} onChange={setBrandId} options={brands.map((b) => ({ value: b.id, label: `${b.name} · ${b.merchant}` }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conversion ratio (bps)" value={ratio} onChange={setRatio} type="number" hint="10000 = 1:1" />
          <Field label="Daily cap (pts, 0 = none)" value={maxDay} onChange={setMaxDay} type="number" />
        </div>
        <Field label="Low-balance threshold (minor)" value={threshold} onChange={setThreshold} type="number" hint="100 = AED 1" />
        <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Enable</Button></div>
      </div>
    </Modal>
  );
}

function FundModal({ partnerId, merchant, onClose, onDone }: { partnerId: string; merchant: PartnerMerchantRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('10000');
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try { await fundAllowance(partnerId, { brandId: merchant.brandId, amountMinor: Number(amount) }); toast('success', 'Allowance funded'); onDone(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Fund allowance" subtitle={merchant.brandName}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Direct credit (outside the request queue). Current balance: <span className="font-semibold text-foreground">{aed(merchant.allowanceBalance)}</span></p>
        <Field label="Amount to add (minor units)" value={amount} onChange={setAmount} type="number" hint="100 = AED 1 · 10000 = AED 100" />
        <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Fund</Button></div>
      </div>
    </Modal>
  );
}
