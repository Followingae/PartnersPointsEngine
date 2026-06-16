'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card, SectionTitle } from '@/components/ui';
import { getRfm, type RfmRow } from '@/lib/api';

const fmt = (v: string | number) => Number(v).toLocaleString();

export default function CustomersPage() {
  const [rfm, setRfm] = useState<RfmRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getRfm()
      .then(setRfm)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  return (
    <div>
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Brand console</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Customers & RFM</h1>
      </header>

      {error ? <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <Card className="p-6">
        <SectionTitle action={<Badge tone="lime">{rfm.length} members</Badge>}>RFM segmentation</SectionTitle>
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Recency</th>
                <th className="px-4 py-3 font-semibold">Frequency</th>
                <th className="px-4 py-3 font-semibold">Monetary</th>
                <th className="px-4 py-3 font-semibold">R / F / M</th>
                <th className="px-4 py-3 font-semibold">Segment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rfm.map((r) => (
                <tr key={r.membershipId} className="cursor-pointer transition hover:bg-muted/40" onClick={() => router.push(`/customers/${r.membershipId}`)}>
                  <td className="px-4 py-3 font-mono text-xs">{r.membershipId.slice(0, 16)}…</td>
                  <td className="px-4 py-3">{r.recencyDays == null ? '—' : `${r.recencyDays}d`}</td>
                  <td className="px-4 py-3">{r.frequency}</td>
                  <td className="px-4 py-3 font-display font-semibold">{fmt(r.monetary)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">
                      {r.r}/{r.f}/{r.m}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.segment === 'champions' || r.segment === 'loyal'
                          ? 'lime'
                          : r.segment === 'at_risk' || r.segment === 'cant_lose'
                            ? 'coral'
                            : r.segment === 'new' || r.segment === 'potential_loyalist'
                              ? 'teal'
                              : 'neutral'
                      }
                    >
                      {r.segment.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                </tr>
              ))}
              {!rfm.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No members yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
