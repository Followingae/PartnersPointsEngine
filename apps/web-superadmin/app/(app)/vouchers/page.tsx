'use client';

import { Ticket, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, PageHeader, Select } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cancelVoucher, getVouchers, type AdminVoucherRow } from '@/lib/api';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'issued', label: 'Issued' },
  { value: 'redeemed', label: 'Redeemed' },
  { value: 'expired', label: 'Expired' },
  { value: 'void', label: 'Void' },
];

const tone = (s: string) =>
  s === 'issued' ? 'lime' : s === 'redeemed' ? 'teal' : 'neutral';

/** Platform-wide reward vouchers — who holds what, and what's been used. */
export default function VouchersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminVoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [toCancel, setToCancel] = useState<AdminVoucherRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getVouchers({ q, status, limit: 100 })
      .then((r) => { setRows(r.rows); setTotal(r.total); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function doCancel() {
    if (!toCancel) return;
    setBusy(true);
    try {
      await cancelVoucher(toCancel.id);
      toast('success', `Voucher ${toCancel.code} voided`);
      setToCancel(null);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        subtitle="Platform"
        title="Vouchers"
        action={<Badge tone="teal">{total.toLocaleString()} issued</Badge>}
      />

      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder="Search by voucher code…" /></div>
          <div className="sm:w-52"><Select label="" value={status} onChange={setStatus} options={STATUSES} /></div>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Ticket size={22} />} title="No vouchers" hint="Vouchers appear when customers redeem rewards or fill a stamp card." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Reward</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{v.code}</td>
                    <td className="px-4 py-3">{v.rewardName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.customerName ?? v.loyaltyId ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.brandName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString('en-GB')}
                      {Number(v.pointsSpent) === 0 ? <span className="ml-1 text-xs">· gifted</span> : null}
                    </td>
                    <td className="px-4 py-3"><Badge tone={tone(v.status)}>{v.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {v.status === 'issued' ? (
                        <Button variant="outline" size="sm" onClick={() => setToCancel(v)}><XCircle size={13} /> Void</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        onConfirm={doCancel}
        loading={busy}
        title="Void this voucher?"
        message={`“${toCancel?.rewardName}” (${toCancel?.code}) can no longer be redeemed. The customer keeps any points they spent — refund those separately if needed.`}
        confirmLabel="Void voucher"
      />
    </div>
  );
}
