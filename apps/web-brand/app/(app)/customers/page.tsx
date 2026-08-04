'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card, SectionTitle } from '@/components/ui';
import { Modal } from '@/components/form';
import { getRfm, type RfmRow } from '@/lib/api';
import { MEANINGFUL_SAMPLE, segmentInfo } from '@/lib/rfm';

const fmt = (v: string | number) => Number(v).toLocaleString();

export default function CustomersPage() {
  const [rfm, setRfm] = useState<RfmRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The row whose segment is being explained, if any.
  const [explaining, setExplaining] = useState<RfmRow | null>(null);
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
                    {/* Stops the row's own click from opening the member. */}
                    <button
                      type="button"
                      title={segmentInfo(r.segment).short}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExplaining(r);
                      }}
                      className="rounded-full outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ink/30"
                    >
                      <Badge tone={segmentInfo(r.segment).tone}>
                        {segmentInfo(r.segment).label}
                      </Badge>
                    </button>
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

      <Modal
        open={explaining !== null}
        onClose={() => setExplaining(null)}
        title={explaining ? segmentInfo(explaining.segment).label : ''}
        subtitle={explaining ? segmentInfo(explaining.segment).short : undefined}
        size="lg"
      >
        {explaining ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-foreground">
              {segmentInfo(explaining.segment).meaning}
            </p>

            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What to do
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{segmentInfo(explaining.segment).action}</p>
            </div>

            {/* This member's own numbers, so the label is traceable to data. */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why this member
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {[
                  { k: 'Recency', v: explaining.recencyDays == null ? '—' : `${explaining.recencyDays}d ago`, s: explaining.r },
                  { k: 'Frequency', v: `${explaining.frequency} earns`, s: explaining.f },
                  { k: 'Monetary', v: `${fmt(explaining.monetary)} pts`, s: explaining.m },
                ].map((c) => (
                  <div key={c.k} className="rounded-2xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">{c.k}</p>
                    <p className="mt-0.5 font-display text-lg font-bold leading-tight">{c.v}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">scores {c.s} of 5</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {segmentInfo(explaining.segment).rule}
              </p>
            </div>

            {/* Said plainly rather than hidden, because acting on noise costs money. */}
            {rfm.length < MEANINGFUL_SAMPLE ? (
              <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4">
                <p className="text-sm font-semibold text-[#9b3b52]">Treat this as provisional</p>
                <p className="mt-1 text-sm leading-relaxed text-[#9b3b52]">
                  Scores are quintiles — each customer is ranked against the others, not against a
                  fixed bar. With {rfm.length} {rfm.length === 1 ? 'member' : 'members'}, somebody is
                  in the top fifth by arithmetic alone. These labels start describing real behaviour
                  from around {MEANINGFUL_SAMPLE} members.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
