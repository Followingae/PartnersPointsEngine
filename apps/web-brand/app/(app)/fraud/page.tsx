'use client';

import clsx from 'clsx';
import { CheckCircle2, ShieldAlert, SlidersHorizontal, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  acknowledgeFraudAlert, getFraudAlerts, getFraudRules, resolveFraudAlert, setFraudRule,
  type FraudAlertRow, type FraudRuleRow, type NotificationSeverity,
} from '@/lib/api';

const TONE: Record<NotificationSeverity, 'coral' | 'teal' | 'neutral'> = {
  critical: 'coral', high: 'coral', medium: 'neutral', low: 'teal', info: 'teal',
};
const STATUS_TONE: Record<FraudAlertRow['status'], 'coral' | 'lime' | 'neutral'> = {
  open: 'coral', acknowledged: 'neutral', resolved: 'lime', dismissed: 'neutral',
};

export default function FraudPage() {
  const toast = useToast();
  const [rules, setRules] = useState<FraudRuleRow[]>([]);
  const [alerts, setAlerts] = useState<FraudAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(true);
  const [editing, setEditing] = useState<FraudRuleRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getFraudRules(), getFraudAlerts(showOpen ? 'open' : undefined)])
      .then(([r, a]) => { setRules(r); setAlerts(a); })
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
      <PageHeader subtitle="Brand console" title="Fraud protection" />

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Detection rules</h2>
        </div>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-3">
            {rules.map((r) => (
              <div key={r.key} className="flex items-start gap-3 rounded-2xl border border-border/70 p-4">
                <span className={clsx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl', r.enabled ? 'bg-gradient-coral text-ink' : 'bg-muted text-muted-foreground')}>
                  <ShieldAlert size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.title}</p>
                    <Badge tone={TONE[r.severity] ?? 'neutral'}>{r.severity}</Badge>
                    {r.overridden ? <Badge tone="teal">custom</Badge> : null}
                    {!r.enabled ? <Badge tone="neutral">off</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground/80">Triggers over <b>{r.thresholdNum}</b> in {Math.round(r.windowSeconds / 3600)}h.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Alerts</h2>
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
          <EmptyState icon={<CheckCircle2 size={22} />} title={showOpen ? 'No open alerts' : 'No alerts'} hint="Suspicious earning patterns for your brand will show up here." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rule</th>
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

      {editing ? <EditRule rule={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}
    </div>
  );
}

function EditRule({ rule, onClose, onSaved }: { rule: FraudRuleRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [threshold, setThreshold] = useState(rule.thresholdNum);
  const [severity, setSeverity] = useState(rule.severity);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!/^\d+$/.test(threshold) || Number(threshold) < 1) { toast('error', 'Threshold must be a whole number ≥ 1'); return; }
    setSaving(true);
    try {
      await setFraudRule(rule.key, { thresholdNum: threshold, severity, enabled });
      toast('success', 'Rule updated');
      onSaved();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={rule.title} subtitle={rule.description}>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-ink" />
          Rule enabled
        </label>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Threshold (per {Math.round(rule.windowSeconds / 3600)}h)</label>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <Select
          label="Severity"
          value={severity}
          onChange={(v) => setSeverity(v as NotificationSeverity)}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'critical', label: 'Critical' },
          ]}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save rule</Button>
        </div>
      </div>
    </Modal>
  );
}
