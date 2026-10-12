'use client';

import clsx from 'clsx';
import { CheckCircle2, Clock, Eye, Flag, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  acknowledgeFraudAlert, getFraudAlerts, getFraudRules, requestFraudReview,
  type FraudAlertRow, type FraudRuleRow,
} from '@/lib/api';
import { describeAlert, ruleCopy, STATUS_COPY, SEVERITY_COPY, subjectLabel } from '@/lib/fraud';

function whenText(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

function expiresText(iso: string | null): string | null {
  if (!iso) return null;
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (h <= 0) return 'awaiting the platform';
  if (h < 48) return `expires in ${h}h`;
  return `expires in ${Math.round(h / 24)}d`;
}

export default function FraudPage() {
  const toast = useToast();
  const [rules, setRules] = useState<FraudRuleRow[]>([]);
  const [cases, setCases] = useState<FraudAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<FraudAlertRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getFraudRules(), getFraudAlerts(undefined, 100)])
      .then(([r, a]) => { setRules(r); setCases(a); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  const openCount = useMemo(() => cases.filter((c) => c.status === 'open').length, [cases]);
  const activeProtections = rules.filter((r) => r.enabled).length;

  async function acknowledge(a: FraudAlertRow) {
    try { await acknowledgeFraudAlert(a.id); toast('success', 'Marked as seen'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Fraud protection" />

      {/* Protection status hero */}
      {loading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <div className={clsx('relative overflow-hidden rounded-3xl p-6 shadow-hero sm:p-8', openCount > 0 ? 'bg-gradient-coral text-ink' : 'bg-gradient-lime text-ink')}>
          <div className="flex flex-wrap items-center gap-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-black/10">
              {openCount > 0 ? <ShieldAlert size={32} /> : <ShieldCheck size={32} />}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
                {openCount > 0
                  ? `${openCount} ${openCount === 1 ? 'case needs' : 'cases need'} a look`
                  : "You're protected"}
              </h2>
              <p className="mt-1 max-w-xl text-sm font-medium opacity-80">
                {openCount > 0
                  ? 'We spotted something unusual in how points were earned. Review the cases below — nothing has been changed automatically.'
                  : `${activeProtections} protections are watching your points around the clock. We’ll flag anything unusual here.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active protections — read-only; the platform owns the thresholds */}
      <Card className="mt-6 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">What we watch for</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Lock size={12} /> Set by Partners Points
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          These protections are tuned for you by the Partners Points team. Spot one that’s too strict or too loose? Request a review on any case it raises.
        </p>
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((r) => {
              const c = ruleCopy(r.key);
              return (
                <div key={r.key} className={clsx('flex items-start gap-3 rounded-2xl border p-4', r.enabled ? 'border-border/70' : 'border-border/50 opacity-60')}>
                  <span className={clsx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl', r.enabled ? 'bg-lime-200 text-lime-900' : 'bg-muted text-muted-foreground')}>
                    <ShieldCheck size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{c.label}</p>
                      <Badge tone={r.enabled ? 'lime' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.watches}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent cases */}
      <Card className="mt-6 p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Recent cases</h2>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : cases.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="Nothing suspicious" hint="When a protection spots something, the case shows up here in plain language." />
        ) : (
          <div className="space-y-3">
            {cases.map((a) => {
              const sev = SEVERITY_COPY[a.severity] ?? SEVERITY_COPY.medium;
              const st = STATUS_COPY[a.status];
              const canAck = a.status === 'open';
              const canRequest = a.status === 'open' || a.status === 'acknowledged';
              return (
                <div key={a.id} className="rounded-2xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{ruleCopy(a.ruleKey).label}</p>
                        <Badge tone={sev.tone}>{sev.label}</Badge>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{describeAlert(a)}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {subjectLabel(a)} · {whenText(a.createdAt)}
                      </p>
                      {a.status === 'review_requested' ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-teal/15 px-2.5 py-1 text-xs font-medium text-[#0f6b66]">
                          <Clock size={12} /> Review requested{expiresText(a.requestExpiresAt) ? ` · ${expiresText(a.requestExpiresAt)}` : ''}
                        </p>
                      ) : null}
                    </div>
                    {(canAck || canRequest) ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {canAck ? (
                          <Button size="sm" variant="outline" onClick={() => acknowledge(a)}>
                            <Eye size={14} /> Mark seen
                          </Button>
                        ) : null}
                        {canRequest ? (
                          <Button size="sm" onClick={() => setReviewing(a)}>
                            <Flag size={14} /> Request review
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {reviewing ? (
        <RequestReview alert={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); load(); }} />
      ) : null}
    </div>
  );
}

function RequestReview({ alert, onClose, onDone }: { alert: FraudAlertRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await requestFraudReview(alert.id, reason.trim());
      toast('success', 'Review requested — the Partners Points team will take a look');
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="Request a review" subtitle="Ask the Partners Points team to look at this case">
      <div className="space-y-4">
        <div className="rounded-2xl bg-muted/50 p-4 text-sm leading-relaxed">{describeAlert(alert)}</div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Why are you flagging this? <span className="text-muted-foreground">(optional)</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. This is a staff training account, the earns are genuine."
            className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The platform reviews your request and will resolve or clear the case. This is time-bound — if it isn’t actioned, it stays visible so nothing slips through.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Send request</Button>
        </div>
      </div>
    </Modal>
  );
}
