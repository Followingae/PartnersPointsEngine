'use client';

import { ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Modal, PageHeader } from '@/components/form';
import { Badge, Card, SectionTitle, Skeleton } from '@/components/ui';
import { ActionPill, crStatusTone, DiffView } from '@/components/diff';
import { useToast } from '@/components/toast';
import { approveChangeRequest, getChangeRequest, rejectChangeRequest, type ChangeRequest } from '@/lib/api';

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getChangeRequest(id)
      .then(setCr)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  useEffect(() => load(), [load]);

  async function approve() {
    setBusy(true);
    try {
      await approveChangeRequest(id);
      toast('success', 'Approved & applied');
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    setBusy(true);
    try {
      await rejectChangeRequest(id, reason || undefined);
      toast('success', 'Rejected');
      setRejecting(false);
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/approvals" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft size={15} /> Approvals
      </Link>
      <PageHeader
        subtitle="Platform · Governance"
        title="Change request"
        action={
          cr?.status === 'pending' ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => setRejecting(true)}><X size={15} /> Reject</Button>
              <Button onClick={approve} loading={busy}><Check size={15} /> Approve &amp; apply</Button>
            </div>
          ) : undefined
        }
      />

      {loading || !cr ? (
        <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="p-6">
              <SectionTitle>{cr.action === 'create' ? 'Proposed entity' : 'Proposed changes'}</SectionTitle>
              {cr.action === 'create' ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-4 font-mono text-xs">{JSON.stringify(cr.proposedPayload, null, 2)}</pre>
              ) : (
                <DiffView diff={cr.diff} />
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="p-6">
              <SectionTitle>Summary</SectionTitle>
              <dl className="space-y-2.5 text-sm">
                <Row k="Status" v={<Badge tone={crStatusTone(cr.status)}>{cr.status}</Badge>} />
                <Row k="Entity" v={<span className="capitalize">{cr.entityType.replace(/_/g, ' ')}</span>} />
                <Row k="Action" v={<ActionPill action={cr.action} />} />
                <Row k="Brand" v={<span className="font-mono text-xs">{cr.brandId.slice(0, 8)}…</span>} />
                <Row k="Requester" v={<span className="font-mono text-xs">{cr.requesterId.slice(0, 8)}…</span>} />
                <Row k="Submitted" v={new Date(cr.requestedAt).toLocaleString()} />
                {cr.reviewedAt ? <Row k="Reviewed" v={new Date(cr.reviewedAt).toLocaleString()} /> : null}
              </dl>
              {cr.reason ? <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm"><span className="font-semibold">Requester note:</span> {cr.reason}</p> : null}
              {cr.decisionReason ? <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm"><span className="font-semibold">Decision:</span> {cr.decisionReason}</p> : null}
            </Card>
          </div>
        </div>
      )}

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject change request" subtitle="Optional reason shared with the brand">
        <div className="space-y-4">
          <Field label="Reason" value={reason} onChange={setReason} placeholder="e.g. Discount too aggressive for this tier" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" onClick={reject} loading={busy}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
