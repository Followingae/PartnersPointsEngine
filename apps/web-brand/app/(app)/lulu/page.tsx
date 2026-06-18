'use client';

import { Download, Sparkles, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SectionTitle, Skeleton, StatHero } from '@/components/ui';
import { CategoryBars } from '@/components/charts';
import { TabBar, type TabDef } from '@/components/detail-shell';
import { useToast } from '@/components/toast';
import {
  downloadCsv, getLuluActivity, getLuluLedger, getLuluReports, getLuluStatus, getLuluTopups, requestAllowanceTopup,
  type LuluActivityRow, type LuluLedgerRow, type LuluReports, type LuluStatus, type LuluTopupRow,
} from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'wallet', label: 'Allowance wallet' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'reports', label: 'Reports' },
];

const topupTone = (s: LuluTopupRow['status']) => (s === 'confirmed' ? 'lime' : s === 'rejected' ? 'coral' : s === 'invoiced' ? 'teal' : 'neutral');

export default function LuluPage() {
  const toast = useToast();
  const [status, setStatus] = useState<LuluStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    getLuluStatus()
      .then(setStatus)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <div><PageHeader subtitle="Brand console" title="Lulu Happiness" /><Card className="p-6"><Skeleton className="h-64 w-full" /></Card></div>;

  if (!status?.enabled) {
    return (
      <div>
        <PageHeader subtitle="Brand console" title="Lulu Happiness" />
        <Card className="p-6">
          <EmptyState icon={<Sparkles size={22} />} title="Lulu conversions are not enabled" hint="Ask your Partners Points platform admin to enable Lulu Happiness Points for your brand." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        subtitle="Brand console"
        title="Lulu Happiness"
        action={<Badge tone={status.status === 'active' ? 'lime' : 'coral'}>{status.status === 'active' ? 'Live' : 'Paused'}</Badge>}
      />
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' ? <OverviewTab status={status} /> : null}
      {tab === 'wallet' ? <WalletTab status={status} onFunded={() => getLuluStatus().then(setStatus).catch(() => {})} /> : null}
      {tab === 'conversions' ? <ConversionsTab currency={status.partner?.currencyName ?? 'Lulu Points'} /> : null}
      {tab === 'reports' ? <ReportsTab currency={status.partner?.currencyName ?? 'Lulu Points'} /> : null}
    </div>
  );
}

function OverviewTab({ status }: { status: LuluStatus }) {
  const toast = useToast();
  const [reports, setReports] = useState<LuluReports | null>(null);
  const currency = status.partner?.currencyName ?? 'Lulu Happiness Points';
  const low = Number(status.allowanceBalance ?? 0) <= Number(status.lowBalanceThreshold ?? 0);
  useEffect(() => { getLuluReports(30).then(setReports).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')); }, [toast]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle>How it works</SectionTitle>
          <p className="text-sm text-muted-foreground">
            Your customers convert their points into <span className="font-medium text-foreground">{currency}</span> from the app, at a rate of
            <span className="font-medium text-foreground"> {((status.ratioBps ?? 10000) / 10000).toFixed(2)}×</span>
            {status.maxConversionPerDay ? ` · up to ${num(status.maxConversionPerDay)} pts/day` : ''}. Each conversion draws down your prepaid allowance wallet — top it up under <span className="font-medium text-foreground">Allowance wallet</span>.
          </p>
        </Card>
        <Card className="p-6">
          <SectionTitle>Allowance balance</SectionTitle>
          <p className="mt-1 font-display text-3xl font-bold leading-none">{aed(status.allowanceBalance ?? 0)}</p>
          <p className={`mt-2 text-xs ${low ? 'font-semibold text-[#9b3b52]' : 'text-muted-foreground'}`}>
            {low ? 'Low balance — conversions may pause. ' : ''}Threshold {aed(status.lowBalanceThreshold ?? 0)}
          </p>
        </Card>
      </section>

      {reports ? (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatHero gradient="teal" label="Conversions (30d)" value={num(reports.conversions)} />
            <StatHero gradient="lime" label={`${currency} issued`} value={num(reports.partnerIssued)} />
            <StatHero gradient="coral" label="Points converted" value={num(reports.sourceBurned)} unit="pts" />
          </section>
          <Card className="p-6">
            <SectionTitle>Conversions per day (30d)</SectionTitle>
            {reports.trend.length ? (
              <CategoryBars data={reports.trend.map((t) => ({ label: t.date.slice(5), value: t.conversions }))} color="#3bb0a8" angle={20} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No conversions yet.</p>
            )}
          </Card>
        </>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </div>
  );
}

function WalletTab({ status, onFunded }: { status: LuluStatus; onFunded: () => void }) {
  const toast = useToast();
  const [ledger, setLedger] = useState<LuluLedgerRow[] | null>(null);
  const [topups, setTopups] = useState<LuluTopupRow[] | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const low = Number(status.allowanceBalance ?? 0) <= Number(status.lowBalanceThreshold ?? 0);

  const load = () => {
    getLuluLedger().then(setLedger).catch(() => setLedger([]));
    getLuluTopups().then(setTopups).catch(() => setTopups([]));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const aedAmount = Number(amount);
    if (!aedAmount || aedAmount <= 0) { toast('error', 'Enter an amount in AED'); return; }
    setSaving(true);
    try {
      await requestAllowanceTopup(Math.round(aedAmount * 100), note || undefined);
      toast('success', 'Top-up requested — we’ll invoice you and credit the wallet once paid');
      setAmount(''); setNote('');
      load(); onFunded();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6">
          <SectionTitle>Current balance</SectionTitle>
          <p className="mt-1 font-display text-4xl font-bold leading-none">{aed(status.allowanceBalance ?? 0)}</p>
          <p className={`mt-2 text-xs ${low ? 'font-semibold text-[#9b3b52]' : 'text-muted-foreground'}`}>
            {low ? 'Low balance — conversions may pause. ' : ''}Low-balance threshold {aed(status.lowBalanceThreshold ?? 0)}
          </p>
        </Card>

        {/* Self-serve top-up */}
        <Card className="p-6 lg:col-span-2">
          <SectionTitle>Top up your allowance</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter how much you’d like to add. The platform team raises an invoice; your wallet is credited automatically once payment is confirmed.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40"><Field label="Amount (AED)" value={amount} onChange={setAmount} type="number" placeholder="e.g. 500" /></div>
            <div className="min-w-[200px] flex-1"><Field label="Note (optional)" value={note} onChange={setNote} placeholder="PO number, reference…" /></div>
            <Button onClick={submit} loading={saving}><Wallet size={15} /> Request top-up</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[200, 500, 1000, 2500].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">+ AED {v.toLocaleString()}</button>
            ))}
          </div>
        </Card>
      </section>

      {/* Top-up requests */}
      <Card className="p-5">
        <SectionTitle>Top-up requests</SectionTitle>
        {!topups ? <Skeleton className="h-24 w-full" /> : topups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No top-up requests yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Requested</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {topups.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-display font-semibold">{aed(t.amountMinor)}</td>
                    <td className="px-4 py-3"><Badge tone={topupTone(t.status)}>{t.status}</Badge></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.invoiceRef ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.reviewNote ?? t.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ledger */}
      <Card className="p-5">
        <SectionTitle>Wallet ledger</SectionTitle>
        {!ledger ? <Skeleton className="h-24 w-full" /> : ledger.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No wallet movements yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 text-right font-semibold">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {ledger.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge tone={r.direction === 'credit' ? 'lime' : 'neutral'}>{r.direction === 'credit' ? 'Top-up' : 'Spend'}</Badge></td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.reason}</td>
                    <td className={`px-4 py-3 text-right font-display font-semibold ${r.direction === 'credit' ? 'text-[#4d7c0f]' : ''}`}>{r.direction === 'credit' ? '+' : '−'}{aed(r.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ConversionsTab({ currency }: { currency: string }) {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<LuluActivityRow[] | null>(null);
  const [page, setPage] = useState(0);
  const perPage = 20;
  useEffect(() => { getLuluActivity().then(setRows).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')); }, [toast]);

  const pageRows = useMemo(() => (rows ?? []).slice(page * perPage, page * perPage + perPage), [rows, page]);
  const pages = Math.ceil((rows?.length ?? 0) / perPage);

  return (
    <Card className="p-5">
      <SectionTitle action={<Button size="sm" variant="outline" onClick={() => downloadCsv('/manage/lulu/activity.csv', 'lulu-conversions.csv').catch(() => toast('error', 'Export failed'))}><Download size={14} /> CSV</Button>}>
        Conversion activity
      </SectionTitle>
      {!rows ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No conversions yet.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Points</th><th className="px-4 py-3 font-semibold">{currency}</th><th className="px-4 py-3 font-semibold">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {pageRows.map((c) => (
                  <tr key={c.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/lulu/conversions/${c.id}`)}>
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
          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>Next</Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function ReportsTab({ currency }: { currency: string }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [reports, setReports] = useState<LuluReports | null>(null);
  useEffect(() => { setReports(null); getLuluReports(days).then(setReports).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')); }, [days, toast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${days === d ? 'bg-ink text-white' : 'border border-border/70 text-muted-foreground hover:bg-muted/60'}`}>{d}d</button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadCsv('/manage/lulu/activity.csv', 'lulu-conversions.csv').catch(() => toast('error', 'Export failed'))}><Download size={14} /> CSV</Button>
      </div>
      {!reports ? <Skeleton className="h-40 w-full" /> : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatHero gradient="teal" label={`Conversions (${days}d)`} value={num(reports.conversions)} />
            <StatHero gradient="lime" label={`${currency} issued`} value={num(reports.partnerIssued)} />
            <StatHero gradient="coral" label="Points converted" value={num(reports.sourceBurned)} unit="pts" />
          </section>
          <Card className="p-6">
            <SectionTitle>{currency} issued per day</SectionTitle>
            {reports.trend.length ? (
              <CategoryBars data={reports.trend.map((t) => ({ label: t.date.slice(5), value: Number(t.issued) }))} color="#9bbe1e" angle={20} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No data in this window.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
