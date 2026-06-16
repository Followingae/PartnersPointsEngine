'use client';

import { Award, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  createBadge, createChallenge, deleteBadge, deleteChallenge, getBadges, getChallenges, governanceMessage, governanceOutcome, updateBadge, updateChallenge,
  type BadgeRow, type ChallengeRow,
} from '@/lib/api';

const CHALLENGE_KINDS = [
  { value: 'lifetime_points', label: 'Lifetime points' },
  { value: 'visits', label: 'Visits' },
  { value: 'spend', label: 'Spend' },
];

export default function GamificationPage() {
  const toast = useToast();
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBadge, setEditBadge] = useState<BadgeRow | 'new' | null>(null);
  const [editChallenge, setEditChallenge] = useState<ChallengeRow | 'new' | null>(null);
  const [del, setDel] = useState<{ kind: 'badge' | 'challenge'; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getBadges({ limit: 100 }), getChallenges({ limit: 100 })])
      .then(([b, c]) => { setBadges(b.rows); setChallenges(c.rows); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => load(), [load]);

  async function onDelete() {
    if (!del) return;
    setBusy(true);
    try {
      if (del.kind === 'badge') await deleteBadge(del.id);
      else await deleteChallenge(del.id);
      toast('success', `Deleted “${del.name}”`);
      setDel(null);
      load();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); setDel(null); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Gamification" />

      <Card className="p-6">
        <SectionTitle action={<Button onClick={() => setEditBadge('new')}><Plus size={16} /> New badge</Button>}>Badges</SectionTitle>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : badges.length === 0 ? (
          <EmptyState icon={<Award size={20} />} title="No badges yet" hint="Badges recognise member milestones." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-lime text-ink"><Award size={20} /></span>
                <div className="flex-1">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">+{Number(b.rewardPoints).toLocaleString()} pts</p>
                </div>
                <ActionMenu actions={[
                  { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditBadge(b) },
                  { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setDel({ kind: 'badge', id: b.id, name: b.name }) },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <SectionTitle action={<Button onClick={() => setEditChallenge('new')}><Plus size={16} /> New challenge</Button>}>Challenges</SectionTitle>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : challenges.length === 0 ? (
          <EmptyState icon={<Target size={20} />} title="No challenges yet" hint="Challenges drive members toward a goal." />
        ) : (
          <div className="divide-y divide-border/70">
            {challenges.map((c) => (
              <div key={c.id} className="flex items-center gap-4 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-teal text-ink"><Target size={16} /></span>
                <div className="flex-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">reach {Number(c.target).toLocaleString()} {(c.kind ?? 'lifetime_points').replace('_', ' ')}</span>
                </div>
                <Badge tone={c.enabled ? 'lime' : 'neutral'}>{c.enabled ? 'active' : 'off'}</Badge>
                <Badge tone="lime">+{Number(c.rewardPoints).toLocaleString()} pts</Badge>
                <ActionMenu actions={[
                  { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditChallenge(c) },
                  { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setDel({ kind: 'challenge', id: c.id, name: c.name }) },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {editBadge ? <BadgeModal badge={editBadge === 'new' ? null : editBadge} onClose={() => setEditBadge(null)} onSaved={() => { setEditBadge(null); load(); }} /> : null}
      {editChallenge ? <ChallengeModal challenge={editChallenge === 'new' ? null : editChallenge} onClose={() => setEditChallenge(null)} onSaved={() => { setEditChallenge(null); load(); }} /> : null}

      <ConfirmDialog open={del !== null} onClose={() => setDel(null)} onConfirm={onDelete} loading={busy} title={`Delete ${del?.kind}?`} message={`“${del?.name}” will be permanently removed.`} />
    </div>
  );
}

function BadgeModal({ badge, onClose, onSaved }: { badge: BadgeRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(badge?.name ?? '');
  const [points, setPoints] = useState(badge ? String(badge.rewardPoints) : '25');
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    setSaving(true);
    try {
      if (badge) await updateBadge(badge.id, { name, rewardPoints: Number(points) });
      else await createBadge({ name, rewardPoints: Number(points) });
      toast('success', badge ? 'Badge updated' : 'Badge created');
      onSaved();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); if (g.kind === 'pending') onSaved(); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title={badge ? 'Edit badge' : 'New badge'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. VIP" required error={errors.name} />
        <Field label="Reward points" value={points} onChange={setPoints} type="number" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{badge ? 'Save changes' : 'Create badge'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ChallengeModal({ challenge, onClose, onSaved }: { challenge: ChallengeRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(challenge?.name ?? '');
  const [kind, setKind] = useState(challenge?.kind ?? 'lifetime_points');
  const [target, setTarget] = useState(challenge ? String(challenge.target) : '500');
  const [points, setPoints] = useState(challenge ? String(challenge.rewardPoints) : '50');
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    setSaving(true);
    try {
      if (challenge) await updateChallenge(challenge.id, { name, kind, target: Number(target), rewardPoints: Number(points) });
      else await createChallenge({ name, kind, target: Number(target), rewardPoints: Number(points) });
      toast('success', challenge ? 'Challenge updated' : 'Challenge created');
      onSaved();
    } catch (e) {
      const g = governanceOutcome(e);
      if (g) { toast('info', governanceMessage(g)); if (g.kind === 'pending') onSaved(); }
      else toast('error', e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} title={challenge ? 'Edit challenge' : 'New challenge'}>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Reach 500 points" required error={errors.name} />
        <Select label="Goal type" value={kind} onChange={setKind} options={CHALLENGE_KINDS} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target" value={target} onChange={setTarget} type="number" />
          <Field label="Reward points" value={points} onChange={setPoints} type="number" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{challenge ? 'Save changes' : 'Create challenge'}</Button>
        </div>
      </div>
    </Modal>
  );
}
