'use client';

import { Coins, Download, TrendingUp, Trophy, Users2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SectionTitle, Skeleton, StatHero } from '@/components/ui';
import { CategoryBars, RetentionLines, TrendChart } from '@/components/charts';
import { TabBar, type TabDef } from '@/components/detail-shell';
import { useToast } from '@/components/toast';
import {
  downloadCsv, getByBranch, getChurnRisk, getClv, getCohorts, getEngagement, getLiabilityAging, getSummary, getTrend, getVisitFrequency,
  type BranchBreakdown, type BrandSummary, type ChurnReport, type ClvReport, type CohortReport, type EngagementReport, type LiabilityAging, type TrendPoint, type VisitFrequencyReport,
} from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'customers', label: 'Customers' },
  { key: 'liability', label: 'Revenue & Liability' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'branches', label: 'Branches' },
];

export default function ReportingPage() {
  const [tab, setTab] = useState('overview');
  return (
    <div>
      <PageHeader subtitle="Brand console" title="Reporting & analytics" />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' ? <OverviewTab /> : null}
      {tab === 'customers' ? <CustomersTab /> : null}
      {tab === 'liability' ? <LiabilityTab /> : null}
      {tab === 'engagement' ? <EngagementTab /> : null}
      {tab === 'branches' ? <BranchesTab /> : null}
    </div>
  );
}

function Loading() {
  return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
}

function OverviewTab() {
  const toast = useToast();
  const [summary, setSummary] = useState<BrandSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([getSummary(), getTrend()])
      .then(([s, t]) => { setSummary(s); setTrend(t); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);
  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatHero label="Points earned" value={fmt(summary?.pointsEarned ?? 0)} gradient="lime" icon={<Coins size={16} />} />
        <StatHero label="Points redeemed" value={fmt(summary?.pointsRedeemed ?? 0)} gradient="coral" icon={<Coins size={16} />} />
        <StatHero label="Outstanding liability" value={fmt(summary?.pointsLiability ?? 0)} gradient="teal" icon={<TrendingUp size={16} />} />
        <StatHero label="Members" value={fmt(summary?.members ?? 0)} gradient="ink" icon={<Users2 size={16} />} />
      </section>
      <Card className="p-6">
        <SectionTitle>Points earned vs redeemed (14d)</SectionTitle>
        <TrendChart data={trend.map((t) => ({ date: t.date, earned: Number(t.earned), redeemed: Number(t.redeemed) }))} />
      </Card>
    </div>
  );
}

function CustomersTab() {
  const toast = useToast();
  const router = useRouter();
  const [clv, setClv] = useState<ClvReport | null>(null);
  const [vf, setVf] = useState<VisitFrequencyReport | null>(null);
  const [churn, setChurn] = useState<ChurnReport | null>(null);
  const [cohorts, setCohorts] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([getClv(), getVisitFrequency(), getChurnRisk(), getCohorts()])
      .then(([a, b, c, d]) => { setClv(a); setVf(b); setChurn(c); setCohorts(d); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);
  if (loading || !clv || !vf || !churn || !cohorts) return <Loading />;

  return (
    <div className="space-y-6">
      {/* CLV */}
      <Card className="p-6">
        <SectionTitle action={<Button size="sm" variant="outline" onClick={() => downloadCsv('/manage/reports/clv.csv', 'clv.csv').catch(() => toast('error', 'Export failed'))}><Download size={14} /> CSV</Button>}>
          Customer Lifetime Value
        </SectionTitle>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Avg lifetime" value={fmt(clv.summary.avgLifetime)} />
          <Mini label="Median" value={fmt(clv.summary.medianLifetime)} />
          <Mini label="P90" value={fmt(clv.summary.p90Lifetime)} />
          <Mini label="Total" value={fmt(clv.summary.totalLifetime)} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Distribution</p>
            <CategoryBars data={clv.distribution.map((d) => ({ label: d.bucket, value: d.members }))} color="#9bbe1e" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Top members by lifetime value</p>
            <Ranked rows={clv.top.map((t) => ({ id: t.membershipId, label: t.loyaltyId, value: `${fmt(t.lifetime)} pts` }))} onPick={(id) => router.push(`/customers/${id}`)} />
          </div>
        </div>
      </Card>

      {/* Visit frequency */}
      <Card className="p-6">
        <SectionTitle action={<Button size="sm" variant="outline" onClick={() => downloadCsv('/manage/reports/visit-frequency.csv', 'visit-frequency.csv').catch(() => toast('error', 'Export failed'))}><Download size={14} /> CSV</Button>}>
          Visit frequency
        </SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Visits per member</p>
            <CategoryBars data={vf.histogram.map((h) => ({ label: h.bucket, value: h.members }))} color="#5ba8fb" />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Trophy size={14} /> Most-frequent visitors</p>
            <Ranked rows={vf.leaderboard.map((l) => ({ id: l.membershipId, label: l.loyaltyId, value: `${l.visits} visits` }))} onPick={(id) => router.push(`/customers/${id}`)} />
          </div>
        </div>
      </Card>

      {/* Churn risk */}
      <Card className="p-6">
        <SectionTitle action={<Button size="sm" variant="outline" onClick={() => downloadCsv('/manage/reports/churn-risk.csv', 'churn-risk.csv').catch(() => toast('error', 'Export failed'))}><Download size={14} /> CSV</Button>}>
          Churn risk
        </SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Members by recency</p>
            <CategoryBars data={churn.buckets.map((b) => ({ label: b.bucket.replace('_', ' '), value: b.members }))} color="#ff8a7a" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">At-risk members</p>
            {churn.atRisk.length ? (
              <Ranked rows={churn.atRisk.map((r) => ({ id: r.membershipId, label: r.loyaltyId, value: `${r.daysSince ?? '—'}d ago` }))} onPick={(id) => router.push(`/customers/${id}`)} />
            ) : (
              <EmptyState title="No at-risk members" hint="Everyone's been active recently." />
            )}
          </div>
        </div>
      </Card>

      {/* Cohort retention */}
      <Card className="p-6">
        <SectionTitle>Cohort retention</SectionTitle>
        {cohorts.cohorts.length ? (
          <RetentionLines cohorts={cohorts.cohorts} offsets={cohorts.offsets} />
        ) : (
          <EmptyState title="Not enough history" hint="Retention curves appear once cohorts mature." />
        )}
      </Card>
    </div>
  );
}

function LiabilityTab() {
  const toast = useToast();
  const [aging, setAging] = useState<LiabilityAging>([]);
  const [summary, setSummary] = useState<BrandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([getLiabilityAging(), getSummary()])
      .then(([a, s]) => { setAging(a); setSummary(s); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);
  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatHero label="Outstanding liability" value={fmt(summary?.pointsLiability ?? 0)} unit="pts" gradient="teal" icon={<TrendingUp size={16} />} />
        <StatHero label="Lifetime earned" value={fmt(summary?.pointsEarned ?? 0)} unit="pts" gradient="lime" icon={<Coins size={16} />} />
        <StatHero label="Redeemed" value={fmt(summary?.pointsRedeemed ?? 0)} unit="pts" gradient="coral" icon={<Coins size={16} />} />
      </section>
      <Card className="p-6">
        <SectionTitle>Points scheduled to expire by month</SectionTitle>
        {aging.length ? (
          <CategoryBars data={aging.map((a) => ({ label: a.bucket, value: Number(a.points) }))} color="#3bb0a8" angle={20} />
        ) : (
          <EmptyState title="No scheduled expiry" hint="Active points with an expiry date will age here." />
        )}
      </Card>
    </div>
  );
}

function EngagementTab() {
  const toast = useToast();
  const [data, setData] = useState<EngagementReport | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getEngagement().then(setData).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  if (loading || !data) return <Loading />;
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.funnel.map((f) => <Mini key={f.stage} label={f.stage} value={fmt(f.count)} />)}
        <StatHero label="Repeat rate" value={String(data.repeatRate)} unit="%" gradient="lime" icon={<TrendingUp size={16} />} />
      </section>
      <Card className="p-6">
        <SectionTitle>Onboarding funnel</SectionTitle>
        <CategoryBars data={data.funnel.map((f) => ({ label: f.stage, value: f.count }))} color="#b07cf0" />
      </Card>
    </div>
  );
}

function BranchesTab() {
  const toast = useToast();
  const [rows, setRows] = useState<BranchBreakdown>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getByBranch().then(setRows).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  if (loading) return <Loading />;
  return (
    <Card className="p-6">
      <SectionTitle>Per-branch performance</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="No branches" hint="Branches with terminal activity appear here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3 font-semibold">Branch</th><th className="px-4 py-3 font-semibold">Earned</th><th className="px-4 py-3 font-semibold">Redeemed</th><th className="px-4 py-3 font-semibold">Members</th></tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((r) => (
                <tr key={r.branchId} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 font-display font-semibold">{fmt(r.earned)}</td>
                  <td className="px-4 py-3">{fmt(r.redeemed)}</td>
                  <td className="px-4 py-3"><Badge tone="teal">{r.members}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none">{value}</p>
    </div>
  );
}

function Ranked({ rows, onPick }: { rows: Array<{ id: string; label: string; value: string }>; onPick: (id: string) => void }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ol className="divide-y divide-border/70">
      {rows.slice(0, 8).map((r, i) => (
        <li key={r.id} className="flex cursor-pointer items-center gap-3 py-2.5 transition hover:bg-muted/40" onClick={() => onPick(r.id)}>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
          <span className="flex-1 font-mono text-xs">{r.label}</span>
          <span className="text-sm font-semibold">{r.value}</span>
        </li>
      ))}
    </ol>
  );
}
