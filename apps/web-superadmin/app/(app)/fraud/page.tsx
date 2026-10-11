'use client';

import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  acknowledgeFraudAlert, getFraudAlerts, resolveFraudAlert,
  type FraudAlertRow, type NotificationSeverity,
} from '@/lib/api';

const TONE: Record<NotificationSeverity, 'coral' | 'teal' | 'neutral'> = {
  critical: 'coral', high: 'coral', medium: 'neutral', low: 'teal', info: 'teal',
};
const STATUS_TONE: Record<FraudAlertRow['status'], 'coral' | 'lime' | 'neutral'> = {
  open: 'coral', acknowledged: 'neutral', resolved: 'lime', dismissed: 'neutral',
};

export default function FraudPage() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<FraudAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getFraudAlerts(showOpen ? 'open' : undefined)
      .then(setAlerts)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [showOpen, toast]);
  useEffect(() => load(), [load]);

  async function act(a: FraudAlertRow, kind: 'ack' | 'resolve' | 'dismiss') {
    try {
      if (kind === 'ack') await acknowledgeFraudAlert(a.id);
      else await resolveFraudAlert(a.id, kind === 'dismiss');
      toast('success', kind === 'ack' ? 'Acknowledged' : kind === 'dismiss' ? 'Dismissed' : 'Resolved');
      load();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div>
      <PageHeader subtitle="Platform console" title="Fraud protection" />
      <p className="mb-4 -mt-2 text-sm text-muted-foreground">Fraud alerts across every brand. Thresholds are configured by each brand in its own console.</p>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">Alerts</h2>
          </div>
          <button
            onClick={() => setShowOpen((v) => !v)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
          >
            {showOpen ? 'Showing open only' : 'Showing all'}
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : alerts.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={22} />} title={showOpen ? 'No open alerts' : 'No alerts'} hint="Suspicious earning patterns across the estate will show up here." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Brand</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Observed</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{a.ruleKey}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String((a.detail as { brandId?: string })?.brandId ?? '—').slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.subjectId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.metricValue} <span className="text-muted-foreground/60">/ {a.thresholdValue}</span></td>
                    <td className="px-4 py-3"><Badge tone={TONE[a.severity] ?? 'neutral'}>{a.severity}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'open' || a.status === 'acknowledged' ? (
                        <ActionMenu actions={[
                          ...(a.status === 'open' ? [{ label: 'Acknowledge', icon: <CheckCircle2 size={14} />, onClick: () => act(a, 'ack') }] : []),
                          { label: 'Resolve', icon: <CheckCircle2 size={14} />, onClick: () => act(a, 'resolve') },
                          { label: 'Dismiss', icon: <XCircle size={14} />, danger: true, onClick: () => act(a, 'dismiss') },
                        ]} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
