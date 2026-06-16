'use client';

import { GitPullRequestArrow, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Modal, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, TableSkeleton } from '@/components/ui';
import { ActionPill, crStatusTone, DiffView } from '@/components/diff';
import { useToast } from '@/components/toast';
import { getChangeRequests, withdrawChangeRequest, type ChangeRequest } from '@/lib/api';

const STATUSES = ['all', 'pending', 'approved', 'rejected', 'withdrawn'] as const;

export default function ChangeRequestsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ChangeRequest | null>(null);
  const [toWithdraw, setToWithdraw] = useState<ChangeRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getChangeRequests({ ...(status !== 'all' ? { status } : {}), limit: 100 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [status, toast]);

  useEffect(() => load(), [load]);

  async function onWithdraw() {
    if (!toWithdraw) return;
    setBusy(true);
    try {
      await withdrawChangeRequest(toWithdraw.id);
      toast('success', 'Request withdrawn');
      setToWithdraw(null);
      setOpen(null);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Change requests" action={<Badge tone="teal">{rows.filter((r) => r.status === 'pending').length} pending</Badge>} />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${status === s ? 'bg-ink text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<GitPullRequestArrow size={22} />} title="No change requests" hint="When your program is under approval governance, your proposed edits appear here for platform review." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Changes</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((cr) => (
                  <tr key={cr.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => setOpen(cr)}>
                    <td className="px-4 py-3 font-medium capitalize">{cr.entityType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><ActionPill action={cr.action} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{cr.diff?.length ?? 0} field(s)</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(cr.requestedAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge tone={crStatusTone(cr.status)}>{cr.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open !== null} onClose={() => setOpen(null)} size="lg" title="Change request" subtitle={open ? `${open.entityType.replace(/_/g, ' ')} · ${open.action}` : ''}>
        {open ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone={crStatusTone(open.status)}>{open.status}</Badge>
              <ActionPill action={open.action} />
              <span className="text-xs text-muted-foreground">{new Date(open.requestedAt).toLocaleString()}</span>
            </div>
            {open.action === 'create' ? (
              <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                <p className="mb-2 font-semibold">Proposed {open.entityType.replace(/_/g, ' ')}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(open.proposedPayload, null, 2)}</pre>
              </div>
            ) : (
              <DiffView diff={open.diff} />
            )}
            {open.decisionReason ? <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm"><span className="font-semibold">Reviewer:</span> {open.decisionReason}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              {open.status === 'pending' ? <Button variant="danger" onClick={() => setToWithdraw(open)}><Undo2 size={15} /> Withdraw</Button> : null}
              <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog open={toWithdraw !== null} onClose={() => setToWithdraw(null)} onConfirm={onWithdraw} loading={busy} title="Withdraw request?" message="This pending change request will be cancelled." confirmLabel="Withdraw" />
    </div>
  );
}
