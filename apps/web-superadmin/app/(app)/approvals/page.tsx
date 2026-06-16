'use client';

import { Check, GitPullRequestArrow, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, TableSkeleton } from '@/components/ui';
import { ActionPill, crStatusTone } from '@/components/diff';
import { useToast } from '@/components/toast';
import { bulkApprove, bulkReject, getChangeRequests, type ChangeRequest } from '@/lib/api';

const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn', 'all'] as const;

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3.6e6;
}

export default function ApprovalsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setSel(new Set());
    getChangeRequests({ ...(status !== 'all' ? { status } : {}), limit: 200 })
      .then((r) => setRows(r.rows))
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [status, toast]);

  useEffect(() => load(), [load]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && sel.size === rows.length;

  async function bulk(kind: 'approve' | 'reject') {
    const ids = [...sel];
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = (await (kind === 'approve' ? bulkApprove(ids) : bulkReject(ids))) as { processed: number; failed: number };
      toast(res.failed ? 'info' : 'success', `${res.processed} ${kind}d${res.failed ? `, ${res.failed} failed` : ''}`);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader subtitle="Platform · Governance" title="Approvals" action={<Badge tone="teal">{rows.filter((r) => r.status === 'pending').length} pending</Badge>} />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${status === s ? 'bg-ink text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {s}
              </button>
            ))}
          </div>
          {sel.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{sel.size} selected</span>
              <Button size="sm" onClick={() => bulk('approve')} loading={busy}><Check size={14} /> Approve</Button>
              <Button size="sm" variant="danger" onClick={() => bulk('reject')} loading={busy}><X size={14} /> Reject</Button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<GitPullRequestArrow size={22} />} title="Nothing here" hint={status === 'pending' ? 'No change requests awaiting review.' : `No ${status} requests.`} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={allSelected} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="h-4 w-4 accent-ink" />
                  </th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Changes</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((cr) => {
                  const stale = cr.status === 'pending' && ageHours(cr.requestedAt) > 24;
                  return (
                    <tr key={cr.id} className="transition hover:bg-muted/40">
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(cr.id)} onChange={() => toggle(cr.id)} disabled={cr.status !== 'pending'} className="h-4 w-4 accent-ink disabled:opacity-30" />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/approvals/${cr.id}`} className="font-medium capitalize hover:underline">{cr.entityType.replace(/_/g, ' ')}</Link>
                      </td>
                      <td className="px-4 py-3"><ActionPill action={cr.action} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{cr.diff?.length ?? 0} field(s)</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(cr.requestedAt).toLocaleString()}
                        {stale ? <span className="ml-2 rounded-full bg-coral/20 px-2 py-0.5 text-[11px] font-semibold text-[#9b3b52]">&gt;24h</span> : null}
                      </td>
                      <td className="px-4 py-3"><Badge tone={crStatusTone(cr.status)}>{cr.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
