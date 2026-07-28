'use client';

import { Gift, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, Drawer, EmptyState, SearchInput, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  getBrandRewards, getCustomerDetail, getCustomers, issueVoucher,
  type AdminCustomerDetail, type AdminCustomerMembership, type AdminCustomerRow, type AdminRewardItem,
} from '@/lib/api';

/** Platform-wide customer visibility: every person, across every brand. */
export default function CustomersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [gifting, setGifting] = useState<AdminCustomerMembership | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getCustomers({ q, limit: 100 })
      .then((r) => { setRows(r.rows); setTotal(r.total); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function open(id: string) {
    setDetailLoading(true);
    getCustomerDetail(id)
      .then(setDetail)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setDetailLoading(false));
  }

  return (
    <div>
      <PageHeader
        subtitle="Platform"
        title="Customers"
        action={<Badge tone="teal">{total.toLocaleString()} total</Badge>}
      />

      <Card className="p-5">
        <div className="mb-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search by name, mobile number, or loyalty ID…" />
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={q ? 'No customers match' : 'No customers yet'}
            hint={q ? 'Try a mobile number like 0501234567.' : 'Customers appear as terminals enrol them.'}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Brands</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => open(c.id)}>
                    <td className="px-4 py-3 font-medium">{c.fullName ?? <span className="text-muted-foreground">Unnamed</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.brands.length ? c.brands.join(', ') : <span className="text-muted-foreground">None</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3"><Badge tone={c.status === 'active' ? 'lime' : 'neutral'}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={detail !== null || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.fullName ?? 'Customer'}
        subtitle={detail?.phone ?? undefined}
      >
        {detailLoading || !detail ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Mobile" value={detail.phone ?? '—'} mono />
              <Fact label="Email" value={detail.email ?? '—'} />
              <Fact label="Joined" value={new Date(detail.createdAt).toLocaleDateString('en-GB')} />
              <Fact label="Status" value={detail.status} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Memberships ({detail.memberships.length})
              </p>
              <div className="space-y-2">
                {detail.memberships.map((m) => (
                  <div key={m.membershipId} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{m.brandName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{m.loyaltyId}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-xl font-bold">{Number(m.available).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{m.pointsCode} available</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Lifetime {Number(m.lifetime).toLocaleString()} · since {new Date(m.joinedAt).toLocaleDateString('en-GB')}</span>
                      <Button variant="outline" size="sm" onClick={() => setGifting(m)}>
                        <Gift size={13} /> Give reward
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {detail.recent.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent terminal activity</p>
                <div className="space-y-1.5">
                  {detail.recent.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        {new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {t.brandName ? ` · ${t.brandName}` : ''}
                      </span>
                      <span className={t.intent === 'earn' ? 'font-semibold text-lime-600' : 'font-semibold text-[#c23e6e]'}>
                        {t.intent === 'earn' ? '+' : '−'}{Number(t.points ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Drawer>

      {gifting ? (
        <GiftRewardModal
          membership={gifting}
          onClose={() => setGifting(null)}
          onDone={() => { setGifting(null); if (detail) open(detail.id); }}
        />
      ) : null}
    </div>
  );
}

/**
 * Give a customer a reward without charging points — service recovery and
 * goodwill. Recorded in the audit log with the stated reason.
 */
function GiftRewardModal({
  membership, onClose, onDone,
}: { membership: AdminCustomerMembership; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rewards, setRewards] = useState<AdminRewardItem[]>([]);
  const [rewardId, setRewardId] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ code: string; rewardName: string } | null>(null);

  useEffect(() => {
    getBrandRewards(membership.brandId)
      .then((r) => { setRewards(r); setRewardId(r[0]?.id ?? ''); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [membership.brandId, toast]);

  async function submit() {
    if (!rewardId) return;
    setSaving(true);
    try {
      const v = await issueVoucher({
        membershipId: membership.membershipId,
        catalogItemId: rewardId,
        expiresInDays: Number(expiry) || undefined,
        reason: reason.trim() || undefined,
      });
      setIssued({ code: v.code, rewardName: v.rewardName });
      toast('success', 'Reward issued');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="Give a reward" subtitle={`${membership.brandName} · ${membership.loyaltyId}`}>
      {issued ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-muted/40 p-5 text-center">
            <p className="text-sm text-muted-foreground">{issued.rewardName}</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{issued.code}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              It&apos;s in the customer&apos;s app now. They can also read this code out at the till.
            </p>
          </div>
          <Button onClick={onDone}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This brand has no active rewards yet — add one to its catalogue first.
            </p>
          ) : (
            <>
              <Select
                label="Reward"
                value={rewardId}
                onChange={setRewardId}
                options={rewards.map((r) => ({ value: r.id, label: `${r.name} (${Number(r.pointsCost).toLocaleString()} pts)` }))}
                hint="Issued free — the customer is not charged points."
              />
              <Field label="Expires in (days)" value={expiry} onChange={setExpiry} placeholder="30" />
              <Field label="Reason" value={reason} onChange={setReason} placeholder="e.g. Complaint — cold coffee, 28 Jul" hint="Saved to the audit log." />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={submit} loading={saving} disabled={!rewardId}>Issue reward</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</p>
    </div>
  );
}
