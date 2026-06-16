'use client';

import { ArrowUpRight, Coins, Gift, Layers, Megaphone, Repeat, TrendingUp, Trophy, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ActivityChart, SegmentDonut } from '@/components/charts';
import { Badge, Card, SectionTitle, StatHero } from '@/components/ui';
import {
  getCampaigns, getClv, getEarnRules, getEngagement, getModuleAccess, getRewards, getRfm, getSettings, getSummary, getTiers, getTrend, getVisitFrequency,
  type CampaignRow, type ClvReport, type EarnRuleRow, type RewardRow, type RfmRow, type TierRow, type TrendPoint, type VisitFrequencyReport,
} from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

type ActMode = 'both' | 'earned' | 'redeemed' | 'net';

interface EarnAction { type?: string; pointsPerUnit?: number; unitMinor?: number; points?: number; factorBps?: number }
function summarizeRule(def?: Record<string, unknown>): string {
  const a = (def?.actions as EarnAction[] | undefined)?.[0];
  if (!a) return 'Not configured';
  if (a.type === 'perAmount') return `${a.pointsPerUnit ?? 0} pt / ${((a.unitMinor ?? 100) / 100).toLocaleString()} spent`;
  if (a.type === 'perVisit') return `${a.points ?? 0} pts per visit`;
  if (a.type === 'bonus') return `${a.points ?? 0} bonus pts`;
  if (a.type === 'multiplier') return `${((a.factorBps ?? 10000) / 10000).toFixed(2)}× points`;
  return 'Custom rule';
}

export default function Dashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getSummary>> | null>(null);
  const [rfm, setRfm] = useState<RfmRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [clv, setClv] = useState<ClvReport | null>(null);
  const [visits, setVisits] = useState<VisitFrequencyReport | null>(null);
  const [repeatRate, setRepeatRate] = useState<number | null>(null);
  const [rules, setRules] = useState<EarnRuleRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [brandName, setBrandName] = useState('');
  const [actMode, setActMode] = useState<ActMode>('both');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, r, t] = await Promise.all([getSummary(), getRfm(), getTrend()]);
        setSummary(s); setRfm(r); setTrend(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
      // secondary, non-blocking
      getClv().then(setClv).catch(() => {});
      getVisitFrequency().then(setVisits).catch(() => {});
      getEngagement().then((e) => setRepeatRate(e.repeatRate)).catch(() => {});
      getEarnRules({ limit: 100, sort: 'priority', order: 'asc' }).then((x) => setRules(x.rows)).catch(() => {});
      getRewards({ limit: 100 }).then((x) => setRewards(x.rows)).catch(() => {});
      getTiers({ limit: 100 }).then((x) => setTiers(x.rows)).catch(() => {});
      getCampaigns({ limit: 100 }).then((x) => setCampaigns(x.rows)).catch(() => {});
      getModuleAccess().then((m) => setAccess(m.access)).catch(() => {});
      getSettings().then((x) => setBrandName(x.name)).catch(() => {});
    })();
  }, []);

  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rfm) counts.set(row.segment, (counts.get(row.segment) ?? 0) + 1);
    return [...counts.entries()].map(([segment, count]) => ({ segment, count })).sort((a, b) => b.count - a.count);
  }, [rfm]);

  const activity = trend.map((t) => {
    const earned = Number(t.earned), redeemed = Number(t.redeemed);
    return { date: t.date, earned, redeemed, net: earned - redeemed };
  });
  const earned14 = activity.reduce((s, d) => s + d.earned, 0);

  const enabledRules = rules.filter((r) => r.enabled);
  const primaryRule = enabledRules[0] ?? rules[0];
  const activeRewards = rewards.filter((r) => r.status === 'active');
  const minReward = activeRewards.length ? Math.min(...activeRewards.map((r) => Number(r.pointsCost))) : null;
  const topMultiplier = tiers.length ? Math.max(...tiers.map((t) => t.multiplierBps)) / 10000 : null;
  const liveCampaigns = campaigns.filter((c) => c.enabled);

  const programs = [
    {
      href: '/earn-rules', icon: Coins, grad: 'bg-gradient-lime', label: 'Points earning',
      value: rules.length ? summarizeRule(primaryRule?.definition) : 'Set up',
      hint: rules.length ? `${enabledRules.length} active rule${enabledRules.length === 1 ? '' : 's'}` : 'No rules yet — configure earning',
      show: true,
    },
    {
      href: '/rewards', icon: Gift, grad: 'bg-gradient-coral', label: 'Rewards catalog',
      value: activeRewards.length ? `${activeRewards.length} live` : 'Set up',
      hint: minReward != null ? `Redeem from ${fmt(minReward)} pts` : 'No rewards published yet',
      show: true,
    },
    {
      href: '/tiers', icon: Layers, grad: 'bg-gradient-teal', label: 'Membership tiers',
      value: tiers.length ? `${tiers.length} tiers` : 'Set up',
      hint: topMultiplier != null ? `Up to ${topMultiplier.toFixed(2)}× earn rate` : 'Flat — no tiers configured',
      show: access.tiers !== false,
    },
    {
      href: '/campaigns', icon: Megaphone, grad: 'bg-gradient-ink', label: 'Campaigns',
      value: liveCampaigns.length ? `${liveCampaigns.length} live` : (campaigns.length ? 'Paused' : 'Set up'),
      hint: campaigns.length ? `${campaigns.length} total configured` : 'No campaigns yet',
      show: access.campaigns !== false,
    },
  ].filter((p) => p.show);

  const topSpenders = (clv?.top ?? []).slice(0, 6);
  const frequentVisitors = (visits?.leaderboard ?? []).slice(0, 6);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{brandName || 'Brand console'}</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s how your loyalty program is performing.</p>
        </div>
        <Badge tone="lime">Closed-loop · live</Badge>
      </header>

      {error ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {/* KPI board */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatHero gradient="ink" label="Points liability" value={summary ? fmt(summary.pointsLiability) : '—'} unit="pts" icon={<Wallet size={16} />} delta="outstanding" />
        <StatHero gradient="teal" label="Members" value={summary ? fmt(summary.members) : '—'} icon={<Users size={16} />} delta="enrolled" />
        <StatHero gradient="lime" label="Earned (14d)" value={fmt(earned14)} unit="pts" icon={<TrendingUp size={16} />} delta="last 14 days" />
        <StatHero gradient="coral" label="Points redeemed" value={summary ? fmt(summary.pointsRedeemed) : '—'} unit="pts" icon={<Gift size={16} />} delta="lifetime" />
        <StatHero gradient="teal" label="Avg lifetime value" value={clv ? fmt(clv.summary.avgLifetime) : '—'} unit="pts" icon={<Trophy size={16} />} delta="per member" />
        <StatHero gradient="lime" label="Repeat rate" value={repeatRate != null ? `${repeatRate}` : '—'} unit="%" icon={<Repeat size={16} />} delta="returning members" />
      </section>

      {/* configured loyalty programs */}
      <section className="mt-8">
        <SectionTitle action={<Link href="/settings" className="text-sm font-semibold text-[#0f6b66] hover:underline">Program settings →</Link>}>Your loyalty programs</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {programs.map((p) => (
            <Link key={p.href} href={p.href} className="group flex flex-col rounded-3xl border border-border/70 bg-card p-5 transition hover:shadow-card">
              <div className="flex items-start justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${p.grad} text-ink`}><p.icon size={20} /></span>
                <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-ink" />
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">{p.label}</p>
              <p className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight">{p.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* activity + segments */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle
            action={
              <div className="flex gap-1 rounded-full bg-muted p-1">
                {(['both', 'earned', 'redeemed', 'net'] as ActMode[]).map((m) => (
                  <button key={m} onClick={() => setActMode(m)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${actMode === m ? 'bg-ink text-white' : 'text-muted-foreground hover:text-foreground'}`}>{m}</button>
                ))}
              </div>
            }
          >
            Points activity
          </SectionTitle>
          {activity.length ? <ActivityChart data={activity} mode={actMode} /> : <Empty />}
        </Card>
        <Card className="p-6">
          <SectionTitle action={<Link href="/customers" className="text-xs font-semibold text-[#0f6b66] hover:underline">Explore →</Link>}>RFM segments</SectionTitle>
          {segments.length ? <SegmentDonut data={segments} /> : <Empty />}
        </Card>
      </section>

      {/* leaderboards */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle action={<Link href="/customers" className="text-xs font-semibold text-[#0f6b66] hover:underline">All customers →</Link>}>Top spenders</SectionTitle>
          <Leaderboard
            rows={topSpenders.map((m) => ({ id: m.membershipId, label: m.loyaltyId, value: `${fmt(m.lifetime)} pts` }))}
            grad="bg-gradient-lime"
            onClick={(id) => router.push(`/customers/${id}`)}
            emptyHint="No lifetime spend yet"
          />
        </Card>
        <Card className="p-6">
          <SectionTitle action={<Link href="/customers" className="text-xs font-semibold text-[#0f6b66] hover:underline">All customers →</Link>}>Frequent visitors</SectionTitle>
          <Leaderboard
            rows={frequentVisitors.map((m) => ({ id: m.membershipId, label: m.loyaltyId, value: `${fmt(m.visits)} visits` }))}
            grad="bg-gradient-teal"
            onClick={(id) => router.push(`/customers/${id}`)}
            emptyHint="No repeat visits yet"
          />
        </Card>
      </section>
    </div>
  );
}

function Leaderboard({ rows, grad, onClick, emptyHint }: { rows: { id: string; label: string; value: string }[]; grad: string; onClick: (id: string) => void; emptyHint: string }) {
  if (!rows.length) return <div className="grid h-32 place-items-center text-sm text-muted-foreground">{emptyHint}</div>;
  return (
    <div className="divide-y divide-border/70">
      {rows.map((m, i) => (
        <button key={m.id} onClick={() => onClick(m.id)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-muted/40">
          <span className="w-5 font-mono text-sm text-muted-foreground">{i + 1}</span>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${grad} text-xs font-bold text-ink`}>{m.label.slice(0, 2).toUpperCase()}</span>
          <span className="flex-1 truncate font-mono text-xs">{m.label}</span>
          <span className="font-display text-base font-semibold">{m.value}</span>
          <ArrowUpRight size={15} className="text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="grid h-40 place-items-center text-sm text-muted-foreground">No data yet</div>;
}
