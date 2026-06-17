'use client';

import { Sparkles, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SectionTitle, Skeleton, StatHero } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getLuluActivity, getLuluReports, getLuluStatus, requestAllowanceTopup, type LuluActivityRow, type LuluReports, type LuluStatus } from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();

export default function LuluPage() {
  const toast = useToast();
  const [status, setStatus] = useState<LuluStatus | null>(null);
  const [reports, setReports] = useState<LuluReports | null>(null);
  const [activity, setActivity] = useState<LuluActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [topup, setTopup] = useState(false);

  const load = () => {
    getLuluStatus().then((s) => {
      setStatus(s);
      if (s.enabled) {
        getLuluReports().then(setReports).catch(() => {});
        getLuluActivity().then(setActivity).catch(() => {});
      }
    }).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div><PageHeader subtitle="Brand console" title="Lulu Happiness" /><Card className="p-6"><Skeleton className="h-64 w-full" /></Card></div>;

  const currency = status?.partner?.currencyName ?? 'Lulu Happiness Points';
  const low = status?.enabled && Number(status.allowanceBalance ?? 0) <= Number(status.lowBalanceThreshold ?? 0);

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Lulu Happiness"
        action={status?.enabled ? <Badge tone={status.status === 'active' ? 'lime' : 'coral'}>{status.status === 'active' ? 'Live' : 'Paused'}</Badge> : null}
      />

      {!status?.enabled ? (
        <Card className="p-6">
          <EmptyState icon={<Sparkles size={22} />} title="Lulu conversions are not enabled" hint="Ask your Partners Points platform admin to enable Lulu Happiness Points for your brand." />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* status + allowance */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <SectionTitle>How it works</SectionTitle>
              <p className="text-sm text-muted-foreground">
                Your customers can convert their points into <span className="font-medium text-foreground">{currency}</span> from the app, at a rate of
                <span className="font-medium text-foreground"> {((status.ratioBps ?? 10000) / 10000).toFixed(2)}×</span>
                {status.maxConversionPerDay ? ` · up to ${num(status.maxConversionPerDay)} pts/day` : ''}. Each conversion draws down your prepaid allowance.
              </p>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <SectionTitle>Allowance</SectionTitle>
                <Button size="sm" variant="outline" onClick={() => setTopup(true)}><Wallet size={14} /> Request top-up</Button>
              </div>
              <p className="mt-1 font-display text-3xl font-bold leading-none">{aed(status.allowanceBalance ?? 0)}</p>
              <p className={`mt-2 text-xs ${low ? 'font-semibold text-[#9b3b52]' : 'text-muted-foreground'}`}>
                {low ? 'Low balance — conversions may pause. ' : ''}Threshold {aed(status.lowBalanceThreshold ?? 0)}
              </p>
            </Card>
          </section>

          {/* reports */}
          {reports ? (
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatHero gradient="teal" label="Conversions (30d)" value={num(reports.conversions)} />
              <StatHero gradient="lime" label={`${currency} issued`} value={num(reports.partnerIssued)} />
              <StatHero gradient="coral" label="Points converted" value={num(reports.sourceBurned)} unit="pts" />
            </section>
          ) : null}

          {/* activity */}
          <Card className="p-5">
            <SectionTitle>Conversion activity</SectionTitle>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No conversions yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Points</th><th className="px-4 py-3 font-semibold">{currency}</th><th className="px-4 py-3 font-semibold">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {activity.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.membershipId.slice(0, 12)}…</td>
                        <td className="px-4 py-3">{num(c.sourcePoints)}</td>
                        <td className="px-4 py-3 font-semibold">{num(c.partnerPoints)}</td>
                        <td className="px-4 py-3"><Badge tone={c.status === 'completed' ? 'lime' : c.status === 'failed' ? 'coral' : 'neutral'}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {topup ? <TopupModal onClose={() => setTopup(false)} onDone={() => { setTopup(false); toast('success', 'Top-up requested — your platform admin will fund it'); }} /> : null}
    </div>
  );
}

function TopupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('10000');
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try { await requestAllowanceTopup(Number(amount)); onDone(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title="Request allowance top-up" subtitle="Your platform admin reviews and funds it">
      <div className="space-y-4">
        <Field label="Amount (minor units)" value={amount} onChange={setAmount} type="number" hint="100 = AED 1 · 10000 = AED 100" />
        <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Request</Button></div>
      </div>
    </Modal>
  );
}
