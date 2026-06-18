'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Badge, Card, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getAdminConversion, type ConversionDetail } from '@/lib/api';

const aed = (minor: string | number) => `AED ${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: string | number) => Number(v).toLocaleString();

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-right text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export default function ConversionDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [c, setC] = useState<ConversionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminConversion(params.id)
      .then(setC)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  return (
    <div>
      <Link href="/partnerships" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft size={15} /> Back to Partnerships</Link>
      <PageHeader
        subtitle="Conversion"
        title="Conversion detail"
        action={c ? <Badge tone={c.status === 'completed' ? 'lime' : c.status === 'failed' ? 'coral' : 'neutral'}>{c.status}</Badge> : null}
      />

      {loading ? (
        <Card className="p-6"><Skeleton className="h-72 w-full" /></Card>
      ) : !c ? (
        <Card className="p-6"><p className="text-sm text-muted-foreground">Conversion not found.</p></Card>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <SectionTitle>Customer</SectionTitle>
              <Row label="Name" value={c.customer.name ?? '—'} />
              <Row label="Loyalty ID" value={c.customer.loyaltyId ?? '—'} mono />
              <Row label="Membership" value={<Link className="text-foreground underline-offset-2 hover:underline" href={`/brands/${c.brand.id}`}>{c.brand.name}</Link>} />
              <Row label="Membership ID" value={c.membershipId} mono />
            </Card>
            <Card className="p-6">
              <SectionTitle>Conversion</SectionTitle>
              <Row label="Merchant points burned" value={`${num(c.sourcePoints)} pts`} />
              <Row label={`${c.partner.currencyName} issued`} value={num(c.partnerPoints)} />
              <Row label="Ratio" value={`${(c.ratioBps / 10000).toFixed(2)}×`} />
              <Row label="Allowance cost" value={aed(c.allowanceCostMinor)} />
              <Row label="Partner" value={c.partner.name} />
            </Card>
          </section>

          <Card className="p-6">
            <SectionTitle>Audit trail</SectionTitle>
            <Row label="Created" value={new Date(c.createdAt).toLocaleString()} />
            <Row label="Completed" value={c.completedAt ? new Date(c.completedAt).toLocaleString() : '—'} />
            <Row label="Partner txn ref" value={c.partnerTxnRef ?? '—'} mono />
            {c.failureReason ? <Row label="Failure reason" value={<span className="text-[#9b3b52]">{c.failureReason}</span>} /> : null}
            <Row label="Idempotency key" value={c.idempotencyKey} mono />
          </Card>

          <Card className="p-5">
            <SectionTitle>Allowance movements</SectionTitle>
            {c.allowanceTxns.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No allowance movements recorded.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Direction</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Reason</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {c.allowanceTxns.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3"><Badge tone={t.direction === 'credit' ? 'lime' : 'coral'}>{t.direction}</Badge></td>
                        <td className="px-4 py-3 font-semibold">{aed(t.amountMinor)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
