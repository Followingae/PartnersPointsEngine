'use client';

import {
  ArrowDownRight, ArrowUpRight, Ban, Clock, Coins, Gift, Sparkles, Store, Ticket, Undo2, Users,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Field, Modal, Select } from '@/components/form';
import { BackLink, DetailHeader, TabBar, type TabDef } from '@/components/detail-shell';
import { Badge, Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  getBrandRewards, getCustomerDetail, issueVoucher,
  type AdminCustomerActivity, type AdminCustomerDetail, type AdminCustomerMembership,
  type AdminRewardItem,
} from '@/lib/api';

const num = (v: string | number) => Number(v).toLocaleString();
const day = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const stamp = (v: string) => new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const aed = (minor: string | null) =>
  minor === null ? '—' : `AED ${(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const voucherTone = (s: string) => (s === 'issued' ? 'lime' : s === 'redeemed' ? 'teal' : 'neutral');

type Tab = 'overview' | 'activity' | 'rewards' | 'memberships';
type Feed = 'all' | 'points' | 'rewards';

const isRewardEvent = (t: AdminCustomerActivity['type']) => t.startsWith('voucher_');

/**
 * Reward events and points events are two different stories in one feed, so they
 * get two different looks: rewards wear the teal accent, points the earn/spend
 * arrows. A reader should be able to skim the column of icons alone.
 */
function activityLook(a: AdminCustomerActivity): { icon: ReactNode; chip: string; frame: string } {
  switch (a.type) {
    case 'voucher_issued':
      return { icon: <Gift size={15} />, chip: 'bg-gradient-teal text-ink', frame: 'border-teal/40 bg-teal/[0.07]' };
    case 'voucher_redeemed':
      return { icon: <Ticket size={15} />, chip: 'bg-teal/20 text-[#0f6b66]', frame: 'border-teal/40 bg-teal/[0.07]' };
    case 'voucher_expired':
      return { icon: <Clock size={15} />, chip: 'bg-muted text-muted-foreground', frame: 'border-teal/30 bg-teal/[0.04]' };
    case 'earn':
      return { icon: <ArrowUpRight size={15} />, chip: 'bg-lime-200 text-lime-900', frame: 'border-border/70' };
    case 'redeem':
      return { icon: <ArrowDownRight size={15} />, chip: 'bg-coral/20 text-[#9b3b52]', frame: 'border-border/70' };
    case 'expiry':
      return { icon: <Clock size={15} />, chip: 'bg-muted text-muted-foreground', frame: 'border-border/70' };
    case 'void':
      return { icon: <Ban size={15} />, chip: 'bg-muted text-muted-foreground', frame: 'border-border/70' };
    case 'reverse':
      return { icon: <Undo2 size={15} />, chip: 'bg-muted text-muted-foreground', frame: 'border-border/70' };
    default:
      return { icon: <Sparkles size={15} />, chip: 'bg-muted text-muted-foreground', frame: 'border-border/70' };
  }
}

/** Customer 360 for the platform operator: every brand, every point, every reward. */
export default function CustomerDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const toast = useToast();
  const [d, setD] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [feed, setFeed] = useState<Feed>('all');
  const [gifting, setGifting] = useState<{ initial?: string } | null>(null);

  const load = useCallback(() => {
    getCustomerDetail(personId)
      .then(setD)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [personId, toast]);

  useEffect(() => { load(); }, [load]);

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: 'Activity', count: d?.activity.length },
    { key: 'rewards', label: 'Rewards', count: d?.vouchers.length },
    { key: 'memberships', label: 'Memberships', count: d?.memberships.length },
  ];

  const available = d ? d.memberships.reduce((s, m) => s + Number(m.available), 0) : 0;
  const lifetime = d ? d.memberships.reduce((s, m) => s + Number(m.lifetime), 0) : 0;
  const liveRewards = d ? d.vouchers.filter((v) => v.status === 'issued').length : 0;
  const activity = d ? d.activity.filter((a) => feed === 'all' || (feed === 'rewards') === isRewardEvent(a.type)) : [];

  return (
    <div>
      <BackLink href="/customers" label="Customers" />
      {loading || !d ? (
        <Card className="p-6"><Skeleton className="h-72 w-full" /></Card>
      ) : (
        <>
          <DetailHeader
            subtitle="Customer 360 · Platform"
            title={d.fullName || d.phone || 'Unnamed customer'}
            badge={<Badge tone={d.status === 'active' ? 'lime' : 'neutral'}>{d.status}</Badge>}
            actions={
              <Button size="sm" disabled={d.memberships.length === 0} onClick={() => setGifting({})}>
                <Gift size={15} /> Gift a reward
              </Button>
            }
          />

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-gradient-lime p-5 text-ink shadow-hero">
              <p className="text-xs font-semibold opacity-75">Points available</p>
              <p className="mt-3 font-display text-3xl font-bold leading-none">{num(available)}</p>
              <p className="mt-2 text-xs opacity-70">across {d.memberships.length} brand{d.memberships.length === 1 ? '' : 's'}</p>
            </div>
            <Card className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Lifetime earned</p>
              <p className="mt-3 font-display text-3xl font-bold leading-none">{num(lifetime)}</p>
              <p className="mt-2 text-xs text-muted-foreground">all-time credits</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Rewards held</p>
              <p className="mt-3 font-display text-3xl font-bold leading-none">{liveRewards}</p>
              <p className="mt-2 text-xs text-muted-foreground">{d.vouchers.length} issued in total</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Member since</p>
              <p className="mt-3 font-display text-2xl font-bold leading-none">{day(d.createdAt)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{d.activity.length} recorded events</p>
            </Card>
          </section>

          <TabBar tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} />

          {tab === 'overview' ? (
            <div className="space-y-6">
              <Card className="p-6">
                <SectionTitle>Customer details</SectionTitle>
                <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Row k="Name" v={d.fullName ?? <Dash />} />
                  <Row k="Mobile" v={d.phone ? <a href={`tel:${d.phone}`} className="font-mono text-xs font-medium text-[#0f6b66] hover:underline">{d.phone}</a> : <Dash />} />
                  <Row k="Email" v={d.email ? <a href={`mailto:${d.email}`} className="font-medium text-[#0f6b66] hover:underline">{d.email}</a> : <Dash />} />
                  <Row k="Gender" v={d.gender ? <span className="capitalize">{d.gender}</span> : <Dash />} />
                  <Row k="Birthdate" v={d.birthdate ? day(d.birthdate) : <Dash />} />
                  <Row k="Status" v={<Badge tone={d.status === 'active' ? 'lime' : 'neutral'}>{d.status}</Badge>} />
                  <Row k="Joined" v={day(d.createdAt)} />
                  <Row k="Person ID" v={<span className="font-mono text-xs">{d.id}</span>} />
                </dl>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="p-6 lg:col-span-2">
                  <SectionTitle action={d.activity.length > 6 ? <Button size="sm" variant="outline" onClick={() => setTab('activity')}>View all</Button> : undefined}>
                    Latest activity
                  </SectionTitle>
                  {d.activity.length ? (
                    <ActivityList items={d.activity.slice(0, 6)} />
                  ) : (
                    <EmptyState icon={<Coins size={20} />} title="Nothing has happened yet" hint="Points and rewards land here as they move." />
                  )}
                </Card>

                <Card className="p-6">
                  <SectionTitle>Brands</SectionTitle>
                  {d.memberships.length ? (
                    <ul className="divide-y divide-border/70">
                      {d.memberships.map((m) => (
                        <li key={m.membershipId} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.brandName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{m.loyaltyId}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-display text-base font-bold leading-none">{num(m.available)}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{m.pointsCode}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<Store size={20} />} title="No memberships" hint="This person has not joined a brand yet." />
                  )}
                </Card>
              </div>

              <Card className="p-6">
                <SectionTitle>Terminal transactions</SectionTitle>
                {d.recent.length ? (
                  <div className="overflow-hidden rounded-2xl border border-border/70">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">When</th>
                          <th className="px-4 py-3">Brand</th>
                          <th className="px-4 py-3">Intent</th>
                          <th className="px-4 py-3">State</th>
                          <th className="px-4 py-3 text-right">Basket</th>
                          <th className="px-4 py-3 text-right">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {d.recent.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/40">
                            <td className="px-4 py-3 text-muted-foreground">{stamp(t.at)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{t.brandName ?? '—'}</td>
                            <td className="px-4 py-3 capitalize">{t.intent}</td>
                            <td className="px-4 py-3"><Badge tone={t.state === 'settled' ? 'lime' : 'neutral'}>{t.state}</Badge></td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{aed(t.amountMinor)}</td>
                            <td className={`px-4 py-3 text-right font-semibold ${t.intent === 'earn' ? 'text-[#1f7a3d]' : 'text-[#9b3b52]'}`}>
                              {t.intent === 'earn' ? '+' : '−'}{num(t.points ?? 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={<Coins size={20} />} title="No terminal transactions" hint="Scans at the till appear here." />
                )}
              </Card>
            </div>
          ) : tab === 'activity' ? (
            <Card className="p-6">
              <SectionTitle
                action={
                  <div className="inline-flex rounded-2xl border border-border/70 bg-muted/40 p-1">
                    {([['all', 'All'], ['points', 'Points'], ['rewards', 'Rewards']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setFeed(k)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${feed === k ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                Everything that happened
              </SectionTitle>
              {activity.length ? (
                <ActivityList items={activity} />
              ) : (
                <EmptyState
                  icon={<Coins size={20} />}
                  title={feed === 'all' ? 'No activity yet' : feed === 'rewards' ? 'No reward events' : 'No points movements'}
                  hint={feed === 'all' ? 'Points movements and reward events land here.' : 'Try another filter.'}
                />
              )}
            </Card>
          ) : tab === 'rewards' ? (
            <Card className="p-6">
              <SectionTitle
                action={
                  <Button size="sm" variant="outline" disabled={d.memberships.length === 0} onClick={() => setGifting({})}>
                    <Gift size={13} /> Gift a reward
                  </Button>
                }
              >
                Reward vouchers
              </SectionTitle>
              {d.vouchers.length ? (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Reward</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Brand</th>
                        <th className="px-4 py-3">Points</th>
                        <th className="px-4 py-3">Issued</th>
                        <th className="px-4 py-3">Used / expires</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {d.vouchers.map((v) => (
                        <tr key={v.id} className="hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{v.rewardName}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">{v.code}</td>
                          <td className="px-4 py-3 text-muted-foreground">{v.brandName ?? '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {Number(v.pointsSpent) > 0 ? num(v.pointsSpent) : <span className="inline-flex items-center gap-1"><Gift size={12} /> gifted</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{day(v.issuedAt)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {v.redeemedAt ? `Used ${day(v.redeemedAt)}` : v.expiresAt ? `Expires ${day(v.expiresAt)}` : '—'}
                          </td>
                          <td className="px-4 py-3"><Badge tone={voucherTone(v.status)}>{v.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<Ticket size={20} />}
                  title="No rewards yet"
                  hint="Vouchers appear when this customer redeems a reward — or when you gift one."
                  action={d.memberships.length ? <Button size="sm" onClick={() => setGifting({})}><Gift size={13} /> Gift a reward</Button> : undefined}
                />
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {d.memberships.length ? (
                d.memberships.map((m) => (
                  <Card key={m.membershipId} className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-display text-lg font-semibold">{m.brandName}</p>
                          <Badge tone={m.status === 'active' ? 'lime' : 'neutral'}>{m.status}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{m.loyaltyId}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-2xl font-bold leading-none">{num(m.available)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{m.pointsCode} available</p>
                      </div>
                    </div>
                    <dl className="mt-5 space-y-2.5 border-t border-border/70 pt-4 text-sm">
                      <Row k="Lifetime earned" v={num(m.lifetime)} />
                      <Row k="Joined" v={day(m.joinedAt)} />
                      <Row k="Rewards" v={d.vouchers.filter((v) => v.brandId === m.brandId).length} />
                      <Row k="Membership ID" v={<span className="font-mono text-xs">{m.membershipId}</span>} />
                    </dl>
                    <div className="mt-4 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setGifting({ initial: m.membershipId })}>
                        <Gift size={13} /> Give reward
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-6 lg:col-span-2">
                  <EmptyState icon={<Users size={20} />} title="No memberships" hint="This person exists on the platform but has not joined a brand." />
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {gifting && d && d.memberships.length ? (
        <GiftRewardModal
          memberships={d.memberships}
          initialMembershipId={gifting.initial}
          onClose={() => setGifting(null)}
          onDone={() => { setGifting(null); load(); }}
        />
      ) : null}
    </div>
  );
}

function ActivityList({ items }: { items: AdminCustomerActivity[] }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const look = activityLook(a);
        return (
          <li key={a.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${look.frame}`}>
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${look.chip}`}>{look.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{stamp(a.at)}</span>
                {a.brandName ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1"><Store size={11} /> {a.brandName}</span>
                  </>
                ) : null}
                {a.voucherCode ? (
                  <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground ring-1 ring-border/70">
                    {a.voucherCode}
                  </span>
                ) : null}
              </div>
            </div>
            {a.points ? (
              <span className={`shrink-0 font-display text-sm font-semibold ${a.direction === 'credit' ? 'text-[#1f7a3d]' : 'text-[#9b3b52]'}`}>
                {a.points}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Give a customer a reward without charging points — service recovery and
 * goodwill. Recorded in the audit log with the stated reason. A person can hold
 * several memberships, so the brand is chosen here: rewards come from that
 * brand's catalogue.
 */
function GiftRewardModal({
  memberships, initialMembershipId, onClose, onDone,
}: { memberships: AdminCustomerMembership[]; initialMembershipId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [membershipId, setMembershipId] = useState(initialMembershipId ?? memberships[0]?.membershipId ?? '');
  const [rewards, setRewards] = useState<AdminRewardItem[]>([]);
  const [rewardId, setRewardId] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ code: string; rewardName: string } | null>(null);

  const membership = memberships.find((m) => m.membershipId === membershipId) ?? memberships[0];
  const brandId = membership?.brandId;

  useEffect(() => {
    if (!brandId) return;
    getBrandRewards(brandId)
      .then((r) => { setRewards(r); setRewardId(r[0]?.id ?? ''); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [brandId, toast]);

  async function submit() {
    if (!rewardId || !membership) return;
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

  if (!membership) return null;

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
          {memberships.length > 1 ? (
            <Select
              label="Brand"
              value={membership.membershipId}
              onChange={setMembershipId}
              options={memberships.map((m) => ({ value: m.membershipId, label: `${m.brandName} · ${m.loyaltyId}` }))}
              hint="The reward is issued from this brand's catalogue."
            />
          ) : null}
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
                options={rewards.map((r) => ({ value: r.id, label: `${r.name} (${num(r.pointsCost)} pts)` }))}
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

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}
