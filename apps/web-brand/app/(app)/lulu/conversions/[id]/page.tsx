'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card, SectionTitle, Skeleton } from '@/components/ui';
import { BackLink, DetailHeader } from '@/components/detail-shell';
import { useToast } from '@/components/toast';
import { getLuluConversion, type LuluConversionDetail } from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();

export default function ConversionDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [c, setC] = useState<LuluConversionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLuluConversion(params.id)
      .then(setC)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  if (loading) return <div><BackLink href="/lulu" label="Back to Lulu Happiness" /><Card className="p-6"><Skeleton className="h-64 w-full" /></Card></div>;
  if (!c) return <div><BackLink href="/lulu" label="Back to Lulu Happiness" /><Card className="p-6"><p className="text-sm text-muted-foreground">Conversion not found.</p></Card></div>;

  const tone = c.status === 'completed' ? 'lime' : c.status === 'failed' ? 'coral' : 'neutral';

  return (
    <div>
      <BackLink href="/lulu" label="Back to Lulu Happiness" />
      <DetailHeader
        subtitle="Conversion"
        title={`${num(c.sourcePoints)} pts → ${num(c.partnerPoints)} ${c.partner.currencyName}`}
        badge={<Badge tone={tone}>{c.status}</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Customer */}
        <Card className="p-6">
          <SectionTitle>Customer</SectionTitle>
          <p className="font-display text-xl font-semibold">{c.customer.name ?? 'Member'}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.customer.loyaltyId ?? c.membershipId}</p>
          <Link href={`/customers/${c.membershipId}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition hover:opacity-70">
            View customer <ArrowRight size={14} />
          </Link>
        </Card>

        {/* Conversion detail */}
        <Card className="p-6 lg:col-span-2">
          <SectionTitle>Detail</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Row label="Points converted" value={`${num(c.sourcePoints)} pts`} />
            <Row label={`${c.partner.currencyName} issued`} value={num(c.partnerPoints)} />
            <Row label="Rate" value={`${(c.ratioBps / 10000).toFixed(2)}×`} />
            <Row label="Allowance cost" value={aed(c.allowanceCostMinor)} />
            <Row label="Partner" value={c.partner.name} />
            <Row label="Status" value={c.status} />
            <Row label="Partner txn ref" value={c.partnerTxnRef ?? '—'} mono />
            <Row label="Created" value={new Date(c.createdAt).toLocaleString()} />
            {c.completedAt ? <Row label="Completed" value={new Date(c.completedAt).toLocaleString()} /> : null}
            <Row label="Idempotency key" value={c.idempotencyKey} mono />
          </dl>
          {c.failureReason ? (
            <div className="mt-4 rounded-2xl border border-[#f0c4cc] bg-[#fdf2f4] px-4 py-3 text-sm text-[#9b3b52]">
              <span className="font-semibold">Failure reason: </span>{c.failureReason}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Allowance movements tied to this conversion */}
      <Card className="mt-4 p-5">
        <SectionTitle>Allowance movements</SectionTitle>
        {c.allowanceTxns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No allowance movements recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 text-right font-semibold">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {c.allowanceTxns.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge tone={t.direction === 'credit' ? 'lime' : 'neutral'}>{t.direction === 'credit' ? 'Refund' : 'Spend'}</Badge></td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{t.reason}</td>
                    <td className="px-4 py-3 text-right font-display font-semibold">{t.direction === 'credit' ? '+' : '−'}{aed(t.amountMinor)}</td>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 ${mono ? 'break-all font-mono text-xs' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}
