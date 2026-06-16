'use client';

import { Activity, Boxes, Building2, Coins, ShieldCheck, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Card, SectionTitle, StatHero } from '@/components/ui';
import { getOverview, type Overview } from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

export default function PlatformOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setO)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Superadmin console</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            Platform overview <ShieldCheck className="inline h-7 w-7 text-coral" />
          </h1>
        </div>
        <Badge tone="ink">RFM Loyalty · all merchants</Badge>
      </header>

      {error ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatHero gradient="ink" label="Points liability (platform)" value={o ? fmt(o.pointsLiabilityOutstanding) : '—'} unit="pts" icon={<Coins size={16} />} delta="outstanding" />
        <StatHero gradient="teal" label="Wallet balances" value={o ? fmt(o.walletBalancesTotal) : '—'} unit="minor" icon={<Wallet size={16} />} delta="prepaid" />
        <StatHero gradient="lime" label="Brands" value={o ? fmt(o.brands) : '—'} icon={<Building2 size={16} />} delta="live" />
        <StatHero gradient="coral" label="Merchant groups" value={o ? fmt(o.groups) : '—'} icon={<Boxes size={16} />} delta="onboarded" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle>Engine activity</SectionTitle>
          <div className="flex items-center gap-4 rounded-2xl bg-muted/50 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-lime text-ink">
              <Activity size={24} />
            </span>
            <div>
              <p className="font-display text-3xl font-bold">{o ? fmt(o.journals) : '—'}</p>
              <p className="text-sm text-muted-foreground">ledger journals across the platform</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Every points & wallet movement is a balanced, append-only double-entry journal under per-tenant RLS.
          </p>
        </Card>
        <Card className="p-6">
          <SectionTitle>Liability health</SectionTitle>
          <p className="text-sm text-muted-foreground">
            Outstanding points liability is the platform&apos;s aggregate obligation; prepaid wallet balances fund redemptions.
          </p>
          <div className="mt-5 space-y-3">
            <Row label="Points liability" value={o ? `${fmt(o.pointsLiabilityOutstanding)} pts` : '—'} tone="ink" />
            <Row label="Wallet balances" value={o ? `${fmt(o.walletBalancesTotal)}` : '—'} tone="teal" />
            <Row label="Brands · Groups" value={o ? `${o.brands} · ${o.groups}` : '—'} tone="lime" />
          </div>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'teal' | 'lime' }) {
  const dot = { ink: 'bg-ink', teal: 'bg-teal', lime: 'bg-lime-500' }[tone];
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-display font-semibold">{value}</span>
    </div>
  );
}
