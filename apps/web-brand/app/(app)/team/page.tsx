'use client';

import { Copy, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select } from '@/components/form';
import { Badge, Card, EmptyState, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getTeam, getTeamRoles, inviteMember, revokeMember, updateMemberRole, type TeamMember } from '@/lib/api';

export default function TeamPage() {
  const toast = useToast();
  const [rows, setRows] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Array<{ key: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [toRevoke, setToRevoke] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getTeam(), getTeamRoles()])
      .then(([t, r]) => { setRows(t); setRoles(r); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  async function changeRole(m: TeamMember, roleKey: string) {
    try { await updateMemberRole(m.userId, roleKey); toast('success', 'Role updated'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }
  async function onRevoke() {
    if (!toRevoke) return;
    setBusy(true);
    try { await revokeMember(toRevoke.userId); toast('success', `Revoked ${toRevoke.email}`); setToRevoke(null); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Team & access" action={<Button onClick={() => setInviting(true)}><UserPlus size={16} /> Invite teammate</Button>} />

      <Card className="p-5">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No team members" hint="Invite colleagues and assign their role on this brand." action={<Button onClick={() => setInviting(true)}><UserPlus size={16} /> Invite teammate</Button>} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Member</th><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">MFA</th><th className="px-4 py-3 font-semibold">Last login</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((m) => (
                  <tr key={m.assignmentId} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.fullName ?? m.email}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select value={m.roleKey} onChange={(e) => changeRole(m, e.target.value)} className="rounded-xl border border-input bg-white px-3 py-1.5 text-sm outline-none focus:border-ink">
                        {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">{m.mfa ? <Badge tone="lime"><ShieldCheck size={12} /></Badge> : <span className="text-xs text-muted-foreground">off</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : 'never'}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setToRevoke(m)}>Revoke</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inviting ? <InviteModal roles={roles} onClose={() => setInviting(false)} onDone={() => { setInviting(false); load(); }} /> : null}
      <ConfirmDialog open={toRevoke !== null} onClose={() => setToRevoke(null)} onConfirm={onRevoke} loading={busy} title="Revoke access?" message={`${toRevoke?.email} will lose access to this brand.`} confirmLabel="Revoke" />
    </div>
  );
}

function InviteModal({ roles, onClose, onDone }: { roles: Array<{ key: string; name: string }>; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? 'brand_admin');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [saving, setSaving] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErrors({ email: 'Enter a valid email' }); return; }
    setSaving(true);
    try {
      const r = await inviteMember({ email, fullName: fullName || undefined, roleKey });
      if (r.tempPassword) { setTempPw(r.tempPassword); toast('success', 'Teammate created'); }
      else { toast('success', 'Existing user added to this brand'); onDone(); }
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  if (tempPw) {
    return (
      <Modal open onClose={onDone} title="Temporary password" subtitle="Share it with the teammate — shown once">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-3">
            <code className="flex-1 truncate font-mono text-sm">{tempPw}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(tempPw); toast('success', 'Copied'); }}><Copy size={14} /> Copy</Button>
          </div>
          <p className="text-xs text-muted-foreground">They sign in at the brand console with this email + password and should change it.</p>
          <div className="flex justify-end"><Button onClick={onDone}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Invite teammate" subtitle="Grant a colleague access to this brand">
      <div className="space-y-4">
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="colleague@company.com" required error={errors.email} />
        <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Optional" />
        <Select label="Role" value={roleKey} onChange={setRoleKey} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Send invite</Button>
        </div>
      </div>
    </Modal>
  );
}
