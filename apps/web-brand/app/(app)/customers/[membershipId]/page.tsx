'use client';

import { ArrowDownRight, ArrowUpRight, Award, CalendarX2, Coins, Download, Fingerprint, Gift, Ticket, Trash2, Users2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, Select } from '@/components/form';
import { BackLink, DetailHeader, TabBar, type TabDef } from '@/components/detail-shell';
import { Badge, Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { downloadJson, eraseCustomer, getCustomerProfile, updateCustomerProfile, type CustomerActivityEvent, type CustomerProfile, type CustomerVoucher } from '@/lib/api';

const fmt = (v: string) => Number(v).toLocaleString();
/** Activity points arrive pre-signed ("+120" / "−500") — keep the sign, group the digits. */
const fmtSigned = (v: string) => {
  const sign = /^[+\-−]/.test(v) ? v[0] : '';
  const n = Number(v.slice(sign ? 1 : 0));
  return Number.isFinite(n) ? `${sign}${n.toLocaleString()}` : v;
};
const isVoucherEvent = (t: CustomerActivityEvent['type']) => t.startsWith('voucher_');
const voucherTone = (s: string): 'lime' | 'teal' | 'neutral' => (s === 'issued' ? 'lime' : s === 'redeemed' ? 'teal' : 'neutral');

export default function CustomerProfilePage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', gender: '', birthdate: '' });
  const [saving, setSaving] = useState(false);

  const reload = () =>
    getCustomerProfile(membershipId)
      .then(setP)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, [membershipId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit() {
    if (!p) return;
    setForm({ fullName: p.contact.fullName ?? '', gender: p.contact.gender ?? '', birthdate: p.contact.birthdate ?? '' });
    setEditing(true);
  }
  async function saveProfile() {
    setSaving(true);
    try {
      await updateCustomerProfile(membershipId, { fullName: form.fullName, gender: form.gender, birthdate: form.birthdate || null });
      toast('success', 'Customer details updated');
      setEditing(false);
      await reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function onErase() {
    setBusy(true);
    try {
      await eraseCustomer(membershipId);
      toast('success', 'Member archived (GDPR erasure)');
      router.push('/members');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: 'Activity', count: p?.activity.length },
    { key: 'rewards', label: 'Rewards', count: p?.vouchers.length },
    { key: 'badges', label: 'Badges', count: p?.badges.length },
    { key: 'identifiers', label: 'Identifiers', count: p?.identifiers.length },
  ];

  return (
    <div>
      <BackLink href="/members" label="Members" />
      {loading || !p ? (
        <Card className="p-6"><Skeleton className="h-72 w-full" /></Card>
      ) : (
        <>
          <DetailHeader
            subtitle="Customer 360"
            title={p.contact.fullName || p.loyaltyId}
            badge={<Badge tone={p.status === 'active' ? 'lime' : 'neutral'}>{p.status}</Badge>}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => downloadJson(`/manage/customers/${membershipId}/export`, `${p.loyaltyId}.json`).catch(() => toast('error', 'Export failed'))}>
                  <Download size={15} /> Export data
                </Button>
                <Button size="sm" variant="danger" onClick={() => setErasing(true)}><Trash2 size={15} /> Erase</Button>
              </>
            }
          />

          {/* balance hero */}
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-gradient-lime p-5 text-ink shadow-hero">
              <p className="text-xs font-semibold opacity-75">Available</p>
              <p className="mt-3 font-display text-3xl font-bold leading-none">{fmt(p.balance.available)}</p>
            </div>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Pending</p><p className="mt-3 font-display text-3xl font-bold leading-none">{fmt(p.balance.pending)}</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold text-muted-foreground">Lifetime</p><p className="mt-3 font-display text-3xl font-bold leading-none">{fmt(p.balance.lifetime)}</p></Card>
          </section>

          <TabBar tabs={tabs} active={tab} onChange={setTab} />

          {tab === 'overview' ? (
            <div className="space-y-6">
              <Card className="p-6">
                <SectionTitle action={<Button size="sm" variant="outline" onClick={openEdit}>Edit details</Button>}>Customer details</SectionTitle>
                <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Row k="Name" v={p.contact.fullName ?? <span className="text-muted-foreground">Not set</span>} />
                  <Row k="Mobile" v={p.contact.phone ? <a href={`tel:${p.contact.phone}`} className="font-medium text-[#0f6b66] hover:underline">{p.contact.phone}</a> : <span className="text-muted-foreground">—</span>} />
                  <Row k="Email" v={p.contact.email ? <a href={`mailto:${p.contact.email}`} className="font-medium text-[#0f6b66] hover:underline">{p.contact.email}</a> : <span className="text-muted-foreground">—</span>} />
                  <Row k="Gender" v={p.contact.gender ? <span className="capitalize">{p.contact.gender}</span> : <span className="text-muted-foreground">—</span>} />
                  <Row k="Birthdate" v={p.contact.birthdate ? new Date(p.contact.birthdate).toLocaleDateString() : <span className="text-muted-foreground">—</span>} />
                </dl>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="p-6 lg:col-span-2">
                <SectionTitle>Tier progress</SectionTitle>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-teal text-ink"><Coins size={18} /></span>
                  <div>
                    <p className="text-xs text-muted-foreground">Current tier</p>
                    <p className="font-display text-xl font-bold leading-tight">{p.tier?.name ?? 'No tier'}</p>
                  </div>
                </div>
                {p.nextTier ? (
                  <div className="mt-4">
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-lime" style={{ width: `${p.progressPct}%` }} /></div>
                    <p className="mt-2 text-sm text-muted-foreground">{p.progressPct}% toward <span className="font-semibold text-foreground">{p.nextTier.name}</span> ({fmt(p.nextTier.threshold)} pts)</p>
                  </div>
                ) : <p className="mt-4 text-sm text-muted-foreground">Top tier reached.</p>}
              </Card>
              <Card className="p-6">
                <SectionTitle>Account</SectionTitle>
                <dl className="space-y-2.5 text-sm">
                  <Row k="Loyalty ID" v={<span className="font-mono text-xs">{p.loyaltyId}</span>} />
                  <Row k="Joined" v={new Date(p.joinedAt).toLocaleDateString()} />
                  <Row k="Badges" v={<span className="inline-flex items-center gap-1"><Award size={13} /> {p.badges.length}</span>} />
                  <Row k="Referrals" v={<span className="inline-flex items-center gap-1"><Users2 size={13} /> {p.referrals.made} ({p.referrals.qualified} qualified)</span>} />
                </dl>
              </Card>
              </div>
            </div>
          ) : tab === 'activity' ? (
            <Card className="p-6">
              {p.activity.length ? (
                <ul className="divide-y divide-border/70">
                  {p.activity.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-3">
                      <span className={`grid h-9 w-9 place-items-center rounded-full ${eventAccent(e)}`}>{eventIcon(e)}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.at).toLocaleString()}
                          {e.voucherCode ? <> · <span className="font-mono">{e.voucherCode}</span></> : null}
                        </p>
                      </div>
                      {e.points ? (
                        <span className={`font-display font-semibold ${e.direction === 'credit' ? 'text-[#1f7a3d]' : 'text-[#9b3b52]'}`}>{fmtSigned(e.points)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={<Coins size={20} />} title="No activity yet" />}
            </Card>
          ) : tab === 'rewards' ? (
            <Card className="p-6">
              {p.vouchers.length ? (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Reward</th>
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Points</th>
                        <th className="px-4 py-3 font-semibold">Issued</th>
                        <th className="px-4 py-3 font-semibold">Used / expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {p.vouchers.map((v) => (
                        <tr key={v.id} className="hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{v.rewardName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{v.code}</td>
                          <td className="px-4 py-3"><Badge tone={voucherTone(v.status)}>{v.status}</Badge></td>
                          <td className="px-4 py-3">{v.pointsSpent === '0' ? <span className="text-muted-foreground">Gifted</span> : <span className="font-display font-semibold">{fmt(v.pointsSpent)}</span>}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(v.issuedAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">{voucherOutcome(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState icon={<Gift size={20} />} title="No rewards claimed yet" hint="Vouchers issued, used, gifted or expired will appear here." />}
            </Card>
          ) : tab === 'badges' ? (
            <Card className="p-6">
              {p.badges.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {p.badges.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/70 p-4">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-lime text-ink"><Award size={20} /></span>
                      <div><p className="font-semibold">{b.name}</p><p className="text-xs text-muted-foreground">{new Date(b.awardedAt).toLocaleDateString()}</p></div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={<Gift size={20} />} title="No badges earned yet" />}
            </Card>
          ) : (
            <Card className="p-6">
              {p.identifiers.length ? (
                <ul className="divide-y divide-border/70">
                  {p.identifiers.map((idf, i) => (
                    <li key={i} className="flex items-center gap-3 py-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"><Fingerprint size={15} /></span>
                      <span className="flex-1 font-medium capitalize">{idf.type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">{new Date(idf.addedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={<Fingerprint size={20} />} title="No identifiers linked" />}
            </Card>
          )}
        </>
      )}

      {editing ? (
        <Modal open onClose={() => setEditing(false)} title="Edit customer details" subtitle="Profile data your team maintains">
          <div className="space-y-4">
            <Field label="Full name" value={form.fullName} onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder="e.g. Sara Al Maktoum" />
            <Select label="Gender" value={form.gender} onChange={(v) => setForm((f) => ({ ...f, gender: v }))} options={[{ value: '', label: 'Undisclosed' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }]} />
            <Field label="Birthdate" type="date" value={form.birthdate} onChange={(v) => setForm((f) => ({ ...f, birthdate: v }))} hint="Used for birthday rewards and age segments." />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveProfile} loading={saving}>Save</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={erasing}
        onClose={() => setErasing(false)}
        onConfirm={onErase}
        loading={busy}
        title="Erase member data?"
        message="GDPR erasure archives this membership and removes it from active lists. This cannot be undone."
        confirmLabel="Erase"
      />
    </div>
  );
}

/** Reward events read as their own thread in the feed — teal, ticket-shaped —
    while points movements keep the ledger's credit/debit colours. */
function eventAccent(e: CustomerActivityEvent): string {
  if (isVoucherEvent(e.type)) return 'bg-teal/20 text-[#0f6b66]';
  if (e.direction === 'credit') return 'bg-lime-200 text-lime-900';
  if (e.direction === 'debit') return 'bg-coral/20 text-[#9b3b52]';
  return 'bg-muted text-muted-foreground';
}

function eventIcon(e: CustomerActivityEvent): React.ReactNode {
  if (e.type === 'voucher_redeemed') return <Ticket size={15} />;
  if (e.type === 'voucher_expired') return <CalendarX2 size={15} />;
  if (e.type === 'voucher_issued') return <Gift size={15} />;
  return e.direction === 'credit' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />;
}

function voucherOutcome(v: CustomerVoucher): string {
  if (v.redeemedAt) return `Used ${new Date(v.redeemedAt).toLocaleDateString()}`;
  if (!v.expiresAt) return '—';
  return `${v.status === 'expired' ? 'Expired' : 'Expires'} ${new Date(v.expiresAt).toLocaleDateString()}`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
