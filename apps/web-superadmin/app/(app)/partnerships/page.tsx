'use client';

import { Handshake, Plus, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, SectionTitle, Skeleton, StatHero } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  enableMerchant, ensureLulu, fundAllowance, getBrandsDirectory, getPartnerConversions, getPartnerMerchants,
  getPartnerOverview, getPartners, updatePartner, updatePartnerMerchant,
  type BrandDirectoryRow, type ConversionRow, type PartnerMerchantRow, type PartnerOverview, type PartnerSummary,
} from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();

export default function PartnershipsPage() {
  const toast = useToast();
  const [partner, setPartner] = useState<PartnerSummary | null>(null);
  const [overview, setOverview] = useState<PartnerOverview | null>(null);
  const [merchants, setMerchants] = useState<PartnerMerchantRow[]>([]);
  const [conversions, setConversions] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [funding, setFunding] = useState<PartnerMerchantRow | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureLulu();
      const partners = await getPartners();
      const lulu = partners.find((p) => p.key === 'lulu') ?? partners[0];
      setPartner(lulu);
      if (lulu) {
        const [ov, ms, cv] = await Promise.all([getPartnerOverview(lulu.id), getPartnerMerchants(lulu.id), getPartnerConversions(lulu.id)]);
        setOverview(ov); setMerchants(ms); setConversions(cv);
      }
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function toggleMerchant(m: PartnerMerchantRow) {
    try { await updatePartnerMerchant(m.id, { status: m.status === 'active' ? 'inactive' : 'active' }); toast('success', 'Updated'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  if (loading) return <div><PageHeader subtitle="Platform" title="Partnerships" /><Card className="p-6"><Skeleton className="h-72 w-full" /></Card></div>;

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

          {/* connector + defaults */}
          <ConnectorCard partner={partner} onSaved={load} />

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
            <SectionTitle>Recent conversions</SectionTitle>
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
                      <tr key={c.id} className="hover:bg-muted/40">
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
    </div>
  );
}

function ConnectorCard({ partner, onSaved }: { partner: PartnerSummary; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState(partner.connectorMode);
  const [ratio, setRatio] = useState(String(partner.defaultRatioBps));
  const [cost, setCost] = useState(String(partner.costPerPartnerPointMinor));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await updatePartner(partner.id, { connectorMode: mode, defaultRatioBps: Number(ratio), costPerPartnerPointMinor: Number(cost) }); toast('success', 'Saved'); onSaved(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Card className="p-6">
      <SectionTitle>Connector &amp; defaults</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">Stub mode runs end-to-end with no external calls. Switch to live once the Lulu API is connected.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="Connector mode" value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: 'stub', label: 'Stub (no external API)' }, { value: 'sandbox', label: 'Sandbox' }, { value: 'live', label: 'Live' }]} />
        <Field label="Default ratio (bps)" value={ratio} onChange={setRatio} type="number" hint="10000 = 1 merchant pt → 1 Lulu pt" />
        <Field label="Cost per Lulu pt (minor)" value={cost} onChange={setCost} type="number" hint="100 = AED 1" />
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={save} loading={saving}>Save</Button></div>
    </Card>
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
        <p className="text-sm text-muted-foreground">Current balance: <span className="font-semibold text-foreground">{aed(merchant.allowanceBalance)}</span></p>
        <Field label="Amount to add (minor units)" value={amount} onChange={setAmount} type="number" hint="100 = AED 1 · 10000 = AED 100" />
        <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Fund</Button></div>
      </div>
    </Modal>
  );
}
