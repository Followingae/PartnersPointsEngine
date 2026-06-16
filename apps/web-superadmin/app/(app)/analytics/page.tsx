'use client';

import { Building2, Coins, TrendingUp, Users2, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Badge, Card, SectionTitle, StatHero, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getPlatformAnalytics, type PlatformAnalytics } from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();
const money = (minor: string) => `${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PlatformAnalyticsPage() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPlatformAnalytics().then(setData).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);

  return (
    <div>
      <PageHeader subtitle="Platform" title="Platform analytics" />
      {loading || !data ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatHero label="Merchants" value={fmt(data.totals.merchants)} gradient="coral" icon={<Building2 size={16} />} />
            <StatHero label="Brands" value={fmt(data.totals.brands)} gradient="teal" icon={<Building2 size={16} />} />
            <StatHero label="Members" value={fmt(data.totals.members)} gradient="lime" icon={<Users2 size={16} />} />
            <StatHero label="Points liability" value={fmt(data.totals.liability)} gradient="ink" icon={<TrendingUp size={16} />} />
          </section>
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Points issued</p><p className="mt-2 font-display text-2xl font-bold">{fmt(data.totals.pointsIssued)}</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Points redeemed</p><p className="mt-2 font-display text-2xl font-bold">{fmt(data.totals.pointsRedeemed)}</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Wallet funding</p><p className="mt-2 font-display text-2xl font-bold">{money(data.totals.walletFunding)}</p></Card>
          </section>
          <Card className="p-5">
            <SectionTitle>Per-merchant</SectionTitle>
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3 font-semibold">Merchant</th><th className="px-4 py-3 font-semibold">Brands</th><th className="px-4 py-3 font-semibold">Members</th><th className="px-4 py-3 font-semibold">Liability</th><th className="px-4 py-3 font-semibold">Wallet</th></tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {data.merchants.map((m) => (
                    <tr key={m.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/merchants/${m.id}`)}>
                      <td className="px-4 py-3"><span className="font-semibold">{m.name}</span> {m.status !== 'active' ? <Badge tone="neutral">{m.status}</Badge> : null}</td>
                      <td className="px-4 py-3">{m.brands}</td>
                      <td className="px-4 py-3">{fmt(m.members)}</td>
                      <td className="px-4 py-3">{fmt(m.liability)} pts</td>
                      <td className="px-4 py-3 font-display font-semibold">{m.currency} {money(m.wallet)}</td>
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
