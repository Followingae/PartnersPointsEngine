'use client';

import { AlertTriangle, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Card, EmptyState, SectionTitle, StatHero, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getLowBalanceAlerts, getPlatformAnalytics, type LowBalanceAlert, type PlatformAnalytics } from '@/lib/api';

const money = (minor: string, ccy = '') => `${ccy ? ccy + ' ' : ''}${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function BillingPage() {
  const toast = useToast();
  const router = useRouter();
  const [alerts, setAlerts] = useState<LowBalanceAlert[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([getLowBalanceAlerts(), getPlatformAnalytics()])
      .then(([a, an]) => { setAlerts(a); setAnalytics(an); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <div>
      <PageHeader subtitle="Platform" title="Wallet & billing" />
      {loading || !analytics ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatHero label="Total wallet funding" value={money(analytics.totals.walletFunding)} gradient="teal" icon={<Wallet size={16} />} />
            <StatHero label="Low-balance alerts" value={String(alerts.length)} gradient={alerts.length ? 'coral' : 'lime'} icon={<AlertTriangle size={16} />} />
            <StatHero label="Merchants" value={String(analytics.totals.merchants)} gradient="ink" icon={<Wallet size={16} />} />
          </section>

          <Card className="mb-6 p-5">
            <SectionTitle>Low-balance alerts</SectionTitle>
            {alerts.length === 0 ? (
              <EmptyState icon={<Wallet size={20} />} title="All wallets healthy" hint="No merchant is below its configured low-balance threshold." />
            ) : (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div key={a.groupId} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-coral/40 bg-coral/5 p-3.5 transition hover:bg-coral/10" onClick={() => router.push(`/merchants/${a.groupId}`)}>
                    <span className="grid h-9 w-9 place-items-center rounded-2xl bg-coral/20 text-[#9b3b52]"><AlertTriangle size={16} /></span>
                    <span className="flex-1 font-semibold">{a.name}</span>
                    <span className="text-sm text-muted-foreground">{money(a.available, a.currency)} / threshold {money(a.threshold, a.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Wallet balances</SectionTitle>
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3 font-semibold">Merchant</th><th className="px-4 py-3 font-semibold">Wallet</th><th className="px-4 py-3 font-semibold">Points liability</th></tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {analytics.merchants.map((m) => (
                    <tr key={m.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/merchants/${m.id}`)}>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3 font-display font-semibold">{money(m.wallet, m.currency)}</td>
                      <td className="px-4 py-3">{Number(m.liability).toLocaleString()} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
