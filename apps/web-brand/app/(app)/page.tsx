'use client';

import { ArrowUpRight, ChevronLeft, ChevronRight, Gift, Globe, Layers, Megaphone, Repeat, Store, TrendingUp, Trophy, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityChart, SegmentDonut } from '@/components/charts';
import { Badge, Card, SectionTitle, StatHero } from '@/components/ui';
import {
  getCampaigns, getClv, getEarnRules, getEngagement, getModuleAccess, getPointsByType, getRewards, getRfm, getSettings, getSummary, getTiers, getTrend, getVisitFrequency,
  type CampaignRow, type ClvReport, type EarnRuleRow, type LoyaltyChannel, type PointsByType, type RewardRow, type RfmRow, type TierRow, type TrendPoint, type VisitFrequencyReport,
} from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

type ActMode = 'both' | 'earned' | 'redeemed' | 'net';

interface EarnAction { type?: string; pointsPerUnit?: number; unitMinor?: number; points?: number; factorBps?: number }
interface RuleDef { actions?: EarnAction[]; channel?: LoyaltyChannel }
function summarizeRule(def?: RuleDef): string {
  const a = def?.actions?.[0];
  if (!a) return 'No effect';
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
  const [byType, setByType] = useState<PointsByType | null>(null);
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
      getPointsByType().then(setByType).catch(() => {});
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
  const activeRewards = rewards.filter((r) => r.status === 'active');
  const minReward = activeRewards.length ? Math.min(...activeRewards.map((r) => Number(r.pointsCost))) : null;
  const topMultiplier = tiers.length ? Math.max(...tiers.map((t) => t.multiplierBps)) / 10000 : null;
  const liveCampaigns = campaigns.filter((c) => c.enabled);

  // ── Loyalty TYPES (online vs in-store) — the headline programs ──────────────
  const earnedFor = (c: LoyaltyChannel) => byType?.types.find((t) => t.channel === c)?.earned ?? null;
  const rulesFor = (c: LoyaltyChannel) => enabledRules.filter((r) => {
    const ch = (r.definition as RuleDef | undefined)?.channel;
    return !ch || ch === c; // untyped rules apply to both types
  });
  const typeCard = (c: LoyaltyChannel) => {
    const list = rulesFor(c);
    const primary = list[0]; // rules arrive priority-asc
    const earned = earnedFor(c);
    return {
      channel: c,
      icon: c === 'online' ? Globe : Store,
      grad: c === 'online' ? 'bg-gradient-teal' : 'bg-gradient-coral',
      label: c === 'online' ? 'Online loyalty' : 'In-store loyalty',
      sublabel: c === 'online' ? 'Website & app' : 'POS terminals',
      headline: list.length ? summarizeRule(primary?.definition as RuleDef) : 'Not configured',
      rules: list.length,
      earned: earned != null ? Number(earned) : 0,
    };
  };
  const typePrograms = [
    access.loyalty_online !== false ? typeCard('online') : null,
    access.loyalty_instore !== false ? typeCard('in_store') : null,
  ].filter(Boolean) as ReturnType<typeof typeCard>[];

  // ── Building blocks (shared across types) ───────────────────────────────────
  const blocks = [
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

      {/* KPI carousel — single row, 3D coverflow */}
      <KpiCarousel
        items={[
          { gradient: 'ink', label: 'Points liability', value: summary ? fmt(summary.pointsLiability) : '—', unit: 'pts', icon: <Wallet size={16} />, delta: 'outstanding' },
          { gradient: 'teal', label: 'Members', value: summary ? fmt(summary.members) : '—', icon: <Users size={16} />, delta: 'enrolled' },
          { gradient: 'lime', label: 'Earned (14d)', value: fmt(earned14), unit: 'pts', icon: <TrendingUp size={16} />, delta: 'last 14 days' },
          { gradient: 'coral', label: 'Points redeemed', value: summary ? fmt(summary.pointsRedeemed) : '—', unit: 'pts', icon: <Gift size={16} />, delta: 'lifetime' },
          { gradient: 'teal', label: 'Avg lifetime value', value: clv ? fmt(clv.summary.avgLifetime) : '—', unit: 'pts', icon: <Trophy size={16} />, delta: 'per member' },
          { gradient: 'lime', label: 'Repeat rate', value: repeatRate != null ? `${repeatRate}` : '—', unit: '%', icon: <Repeat size={16} />, delta: 'returning members' },
        ]}
      />

      {/* configured loyalty TYPES */}
      <section className="mt-8">
        <SectionTitle action={<Link href="/earn-rules" className="text-sm font-semibold text-[#0f6b66] hover:underline">Manage earn rules →</Link>}>Your loyalty programs</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {typePrograms.map((t) => (
            <Link key={t.channel} href="/earn-rules" className="group flex flex-col rounded-3xl border border-border/70 bg-card p-6 transition hover:shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${t.grad} text-ink`}><t.icon size={22} /></span>
                  <div>
                    <p className="font-display text-lg font-bold leading-tight">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.sublabel}</p>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-ink" />
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Award rule</p>
                  <p className="mt-1 font-display text-2xl font-bold leading-none tracking-tight">{t.headline}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t.rules} active rule{t.rules === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold leading-none">{fmt(t.earned)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">pts earned · 14d</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {blocks.length ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {blocks.map((p) => (
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
        ) : null}
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

interface KpiItem { gradient: string; label: string; value: string; unit?: string; delta?: string; icon: ReactNode }

/** Single-row 3D coverflow of KPI cards. Click a side card (or the arrows/dots) to rotate it to center. */
function KpiCarousel({ items }: { items: KpiItem[] }) {
  const [active, setActive] = useState(0);
  const n = items.length;
  const go = (d: number) => setActive((a) => (a + d + n) % n);
  return (
    <section className="mt-1">
      <div className="relative" style={{ perspective: '1600px' }}>
        <div className="relative mx-auto h-[188px] w-full max-w-3xl [transform-style:preserve-3d]">
          {items.map((it, i) => {
            let off = i - active;
            if (off > n / 2) off -= n;
            if (off < -n / 2) off += n;
            const abs = Math.abs(off);
            const hidden = abs > 2;
            return (
              <div
                key={it.label}
                onClick={() => off !== 0 && setActive(i)}
                className={`absolute left-1/2 top-0 w-[300px] transition-all duration-500 ease-out ${off === 0 ? '' : 'cursor-pointer'}`}
                style={{
                  transform: `translateX(-50%) translateX(${off * 58}%) translateZ(${-abs * 140}px) rotateY(${off * -32}deg) scale(${off === 0 ? 1 : 0.82})`,
                  opacity: hidden ? 0 : off === 0 ? 1 : 0.5,
                  zIndex: 20 - abs,
                  pointerEvents: hidden ? 'none' : 'auto',
                }}
              >
                <StatHero gradient={it.gradient} label={it.label} value={it.value} unit={it.unit} delta={it.delta} icon={it.icon} />
              </div>
            );
          })}
        </div>

        <button onClick={() => go(-1)} aria-label="Previous" className="absolute left-0 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 shadow-card backdrop-blur transition hover:bg-card">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => go(1)} aria-label="Next" className="absolute right-0 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 shadow-card backdrop-blur transition hover:bg-card">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {items.map((it, i) => (
          <button key={it.label} onClick={() => setActive(i)} aria-label={`Show ${it.label}`} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-ink' : 'w-1.5 bg-border hover:bg-muted-foreground/40'}`} />
        ))}
      </div>
    </section>
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
