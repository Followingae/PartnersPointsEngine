'use client';

import clsx from 'clsx';
import {
  CheckCircle2, Clock, Eye, ShieldAlert, ShieldCheck, ShieldX, SlidersHorizontal,
  Store, ThumbsDown, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton, StatHero } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  acknowledgeFraudAlert, getBrandFraudRules, getFraudAlerts, getFraudBrands,
  rejectFraudReview, resolveFraudAlert, setBrandFraudRule,
  type FraudAlertRow, type FraudBrandRow, type FraudRuleRow,
} from '@/lib/api';
import { describeAlert, ruleCopy, STATUS_COPY, SEVERITY_COPY, subjectLabel } from '@/lib/fraud';

// ── little date helpers ────────────────────────────────────────────────────────
function whenText(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

function expiresText(iso: string | null): { label: string; urgent: boolean } | null {
  if (!iso) return null;
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (h <= 0) return { label: 'overdue', urgent: true };
  if (h < 24) return { label: `expires in ${h}h`, urgent: h <= 6 };
  return { label: `expires in ${Math.round(h / 24)}d`, urgent: false };
}

const brandIdOf = (a: FraudAlertRow): string => String((a.detail as { brandId?: string })?.brandId ?? '');

type Pending = { alert: FraudAlertRow; kind: 'resolve' | 'dismiss' | 'reject' };
type StatusFilter = 'attention' | 'all' | 'resolved';

export default function FraudControlCenter() {
  const toast = useToast();
  const [brands, setBrands] = useState<FraudBrandRow[]>([]);
  const [alerts, setAlerts] = useState<FraudAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attention');
  const [brandFilter, setBrandFilter] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getFraudBrands(), getFraudAlerts(undefined, undefined, 200)])
      .then(([b, a]) => { setBrands(b); setAlerts(a); })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  const brandName = useCallback(
    (id: string) => brands.find((b) => b.id === id)?.name ?? null,
    [brands],
  );

  const reviewQueue = useMemo(() => alerts.filter((a) => a.status === 'review_requested'), [alerts]);
  const openCount = useMemo(() => alerts.filter((a) => a.status === 'open').length, [alerts]);

  const filtered = useMemo(() => {
    const byStatus = (a: FraudAlertRow) => {
      if (statusFilter === 'attention') return a.status === 'open' || a.status === 'acknowledged' || a.status === 'review_requested';
      if (statusFilter === 'resolved') return a.status === 'resolved' || a.status === 'dismissed';
      return true;
    };
    return alerts.filter((a) => byStatus(a) && (!brandFilter || brandIdOf(a) === brandFilter));
  }, [alerts, statusFilter, brandFilter]);

  async function acknowledge(a: FraudAlertRow) {
    try { await acknowledgeFraudAlert(a.id); toast('success', 'Marked as seen'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div>
      <PageHeader subtitle="Platform console" title="Fraud protection" />
      <p className="mb-6 -mt-5 max-w-2xl text-sm text-muted-foreground">
        The control center for every brand&rsquo;s protection. You configure the rules, see cases across the estate, and are the only authority that closes a case or decides a brand&rsquo;s review request.
      </p>

      {/* 1 — KPI row */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-36 w-full rounded-3xl" />
          <Skeleton className="h-36 w-full rounded-3xl" />
          <Skeleton className="h-36 w-full rounded-3xl" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatHero label="Open cases" value={String(openCount)} unit="awaiting triage" gradient={openCount > 0 ? 'coral' : 'lime'} icon={<ShieldAlert size={16} />} />
          <StatHero label="Review requests" value={String(reviewQueue.length)} unit="need a decision" gradient="teal" icon={<Clock size={16} />} />
          <StatHero label="Brands protected" value={String(brands.length)} unit="across the platform" gradient="ink" icon={<ShieldCheck size={16} />} />
        </div>
      )}

      {/* 2 — Review-request queue (priority) */}
      <Card className="mt-6 p-6">
        <div className="mb-1 flex items-center gap-2">
          <Clock size={16} className="text-[#0f6b66]" />
          <h2 className="font-display text-lg font-semibold">Review requests</h2>
          {reviewQueue.length > 0 ? <Badge tone="teal">{reviewQueue.length} waiting</Badge> : null}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          A brand has asked for help on these cases. Each is time-bound — approve the brand&rsquo;s call, or reject the request and send it back to them.
        </p>
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : reviewQueue.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={22} />} title="Nothing waiting on you" hint="When a brand requests a review on a case, it lands here first." />
        ) : (
          <div className="space-y-3">
            {reviewQueue.map((a) => (
              <ReviewCard key={a.id} alert={a} brandName={brandName(brandIdOf(a))} onAct={(kind) => setPending({ alert: a, kind })} />
            ))}
          </div>
        )}
      </Card>

      {/* 3 — All cases */}
      <Card className="mt-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">All cases</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-border bg-card p-0.5">
              {([['attention', 'Needs attention'], ['all', 'All'], ['resolved', 'Resolved']] as Array<[StatusFilter, string]>).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition',
                    statusFilter === k ? 'bg-ink text-white' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-2xl border border-input bg-white px-3 py-1.5 text-xs outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
            >
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="No cases here" hint="Suspicious earning patterns across every brand show up in this list." />
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <CaseCard
                key={a.id}
                alert={a}
                brandName={brandName(brandIdOf(a))}
                onAck={() => acknowledge(a)}
                onResolve={() => setPending({ alert: a, kind: 'resolve' })}
                onDismiss={() => setPending({ alert: a, kind: 'dismiss' })}
              />
            ))}
          </div>
        )}
      </Card>

      {/* 4 — Per-brand rule configuration */}
      <RuleConfig brands={brands} loading={loading} onChanged={load} />

      {pending ? (
        <NoteModal
          pending={pending}
          brandName={brandName(brandIdOf(pending.alert))}
          onClose={() => setPending(null)}
          onDone={() => { setPending(null); load(); }}
        />
      ) : null}
    </div>
  );
}

// ── Review-request card ─────────────────────────────────────────────────────────
function ReviewCard({ alert, brandName, onAct }: {
  alert: FraudAlertRow;
  brandName: string | null;
  onAct: (kind: Pending['kind']) => void;
}) {
  const sev = SEVERITY_COPY[alert.severity] ?? SEVERITY_COPY.medium;
  const exp = expiresText(alert.requestExpiresAt);
  return (
    <div className="rounded-2xl border border-teal/40 bg-teal/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="ink">{brandName ?? 'Unknown brand'}</Badge>
        <p className="font-semibold">{ruleCopy(alert.ruleKey).label}</p>
        <Badge tone={sev.tone}>{sev.label}</Badge>
        {exp ? (
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', exp.urgent ? 'bg-coral/20 text-[#9b3b52]' : 'bg-teal/20 text-[#0f6b66]')}>
            <Clock size={12} /> {exp.label}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{describeAlert(alert)}</p>
      {alert.requestReason ? (
        <div className="mt-2 rounded-2xl bg-card/80 p-3 text-sm leading-relaxed">
          <span className="font-medium text-muted-foreground">The brand says: </span>
          &ldquo;{alert.requestReason}&rdquo;
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{subjectLabel(alert)} · opened {whenText(alert.createdAt)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAct('resolve')}><ShieldCheck size={14} /> Approve &middot; Resolve</Button>
        <Button size="sm" variant="outline" onClick={() => onAct('dismiss')}><ShieldX size={14} /> Approve &middot; False alarm</Button>
        <Button size="sm" variant="ghost" onClick={() => onAct('reject')}><ThumbsDown size={14} /> Reject review</Button>
      </div>
    </div>
  );
}

// ── Case card (all-cases list) ───────────────────────────────────────────────────
function CaseCard({ alert, brandName, onAck, onResolve, onDismiss }: {
  alert: FraudAlertRow;
  brandName: string | null;
  onAck: () => void;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  const sev = SEVERITY_COPY[alert.severity] ?? SEVERITY_COPY.medium;
  const st = STATUS_COPY[alert.status];
  const closed = alert.status === 'resolved' || alert.status === 'dismissed';
  const actions = [
    ...(alert.status === 'open' ? [{ label: 'Mark seen', icon: <Eye size={14} />, onClick: onAck }] : []),
    ...(!closed ? [
      { label: 'Resolve', icon: <CheckCircle2 size={14} />, onClick: onResolve },
      { label: 'Dismiss (false alarm)', icon: <XCircle size={14} />, danger: true, onClick: onDismiss },
    ] : []),
  ];
  return (
    <div className="rounded-2xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ink">{brandName ?? 'Unknown brand'}</Badge>
            <p className="font-semibold">{ruleCopy(alert.ruleKey).label}</p>
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{describeAlert(alert)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {subjectLabel(alert)} · {whenText(alert.createdAt)}
            <span className="ml-2 font-mono text-muted-foreground/50">{alert.id.slice(0, 8)}</span>
          </p>
          {alert.resolutionNote ? (
            <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Note: {alert.resolutionNote}</p>
          ) : null}
        </div>
        {actions.length > 0 ? <ActionMenu actions={actions} /> : null}
      </div>
    </div>
  );
}

// ── Note modal (resolve / dismiss / reject-review) ───────────────────────────────
const KIND_COPY: Record<Pending['kind'], { title: string; subtitle: string; confirm: string; success: string }> = {
  resolve: { title: 'Resolve case', subtitle: 'Confirm this was real and has been actioned', confirm: 'Resolve case', success: 'Case resolved' },
  dismiss: { title: 'Dismiss case', subtitle: 'Clear this as a false alarm', confirm: 'Dismiss as false alarm', success: 'Case dismissed' },
  reject: { title: 'Reject review request', subtitle: 'Send this back to the brand — the case returns to acknowledged', confirm: 'Reject request', success: 'Review request rejected' },
};

function NoteModal({ pending, brandName, onClose, onDone }: {
  pending: Pending;
  brandName: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const copy = KIND_COPY[pending.kind];

  async function submit() {
    setSaving(true);
    try {
      const n = note.trim() || undefined;
      if (pending.kind === 'reject') await rejectFraudReview(pending.alert.id, n);
      else await resolveFraudAlert(pending.alert.id, pending.kind === 'dismiss', n);
      toast('success', copy.success);
      onDone();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={copy.title} subtitle={copy.subtitle}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-muted/50 p-4 text-sm leading-relaxed">
          <Badge tone="ink">{brandName ?? 'Unknown brand'}</Badge>
          <p className="mt-2">{describeAlert(pending.alert)}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Note <span className="text-muted-foreground">(optional)</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={pending.kind === 'reject' ? 'e.g. The earns look genuine — please keep an eye and re-flag if it recurs.' : 'e.g. Confirmed staff earning on their own card; terminal reset.'}
            className="w-full rounded-2xl border border-input bg-white px-3 py-2 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={pending.kind === 'dismiss' ? 'danger' : 'primary'} onClick={submit} loading={saving}>{copy.confirm}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Per-brand rule configuration ─────────────────────────────────────────────────
function RuleConfig({ brands, loading, onChanged }: {
  brands: FraudBrandRow[];
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [brandId, setBrandId] = useState('');
  const [rules, setRules] = useState<FraudRuleRow[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [editing, setEditing] = useState<FraudRuleRow | null>(null);

  // default the picker to the first brand once brands arrive
  useEffect(() => {
    if (!brandId && brands.length > 0) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const loadRules = useCallback((id: string) => {
    if (!id) return;
    setLoadingRules(true);
    getBrandFraudRules(id)
      .then(setRules)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load rules'))
      .finally(() => setLoadingRules(false));
  }, [toast]);
  useEffect(() => loadRules(brandId), [brandId, loadRules]);

  const selected = brands.find((b) => b.id === brandId);

  async function saveRule(key: string, patch: { enabled?: boolean; thresholdNum?: string; windowSeconds?: number; severity?: string; action?: string }) {
    try {
      await setBrandFraudRule(brandId, key, patch);
      toast('success', 'Rule saved');
      setEditing(null);
      loadRules(brandId);
      onChanged();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to save'); }
  }

  return (
    <Card className="mt-6 p-6">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-muted-foreground" />
        <h2 className="font-display text-lg font-semibold">Brand rule configuration</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        These are the platform&rsquo;s protection settings for each brand. Brands can see their status and request a review, but only you tune the rules here.
      </p>

      {loading ? (
        <Skeleton className="h-10 w-72" />
      ) : brands.length === 0 ? (
        <EmptyState icon={<Store size={22} />} title="No brands yet" hint="Brands appear here once they exist on the platform." />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <Select
                label="Brand"
                value={brandId}
                onChange={setBrandId}
                options={brands.map((b) => ({ value: b.id, label: `${b.name} · ${b.openAlerts} open · ${b.overrides} custom` }))}
              />
            </div>
            {selected ? (
              <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                <Badge tone={selected.openAlerts > 0 ? 'coral' : 'neutral'}>{selected.openAlerts} open cases</Badge>
                <Badge tone={selected.overrides > 0 ? 'teal' : 'neutral'}>{selected.overrides} custom rules</Badge>
              </div>
            ) : null}
          </div>

          {loadingRules ? (
            <Skeleton className="h-40 w-full" />
          ) : rules.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title="No rules for this brand" hint="Protection rules will appear here." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rules.map((r) => (
                <RuleCard key={r.key} rule={r} onToggle={(enabled) => saveRule(r.key, { enabled })} onEdit={() => setEditing(r)} />
              ))}
            </div>
          )}
        </>
      )}

      {editing ? (
        <RuleEditor rule={editing} onClose={() => setEditing(null)} onSave={(patch) => saveRule(editing.key, patch)} />
      ) : null}
    </Card>
  );
}

function RuleCard({ rule, onToggle, onEdit }: {
  rule: FraudRuleRow;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const c = ruleCopy(rule.key);
  const sev = SEVERITY_COPY[rule.severity] ?? SEVERITY_COPY.medium;
  const hours = Math.max(1, Math.round(rule.windowSeconds / 3600));
  return (
    <div className={clsx('flex flex-col rounded-2xl border p-4', rule.enabled ? 'border-border/70' : 'border-border/50 opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{c.label}</p>
            {rule.overridden ? <Badge tone="teal">Custom</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{c.watches}</p>
        </div>
        <Toggle on={rule.enabled} onChange={onToggle} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">Limit {Number(rule.thresholdNum).toLocaleString()}</span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">Over {hours}h</span>
        <Badge tone={sev.tone}>{sev.label}</Badge>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium capitalize">{rule.action}</span>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onEdit}>Configure</Button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-ink' : 'bg-muted')}
    >
      <span className={clsx('absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function RuleEditor({ rule, onClose, onSave }: {
  rule: FraudRuleRow;
  onClose: () => void;
  onSave: (patch: { enabled: boolean; thresholdNum: string; windowSeconds: number; severity: string; action: string }) => void;
}) {
  const c = ruleCopy(rule.key);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [threshold, setThreshold] = useState(String(rule.thresholdNum).replace(/\D/g, ''));
  const [hours, setHours] = useState(String(Math.max(1, Math.round(rule.windowSeconds / 3600))));
  const [severity, setSeverity] = useState<string>(rule.severity);
  const [action, setAction] = useState<string>(rule.action);

  const hoursNum = Math.max(1, Math.floor(Number(hours) || 1));
  const thresholdValid = threshold.length > 0 && Number(threshold) > 0;

  function submit() {
    onSave({
      enabled,
      thresholdNum: threshold,
      windowSeconds: Math.max(60, hoursNum * 3600),
      severity,
      action,
    });
  }

  return (
    <Modal open onClose={onClose} title={c.label} subtitle="Platform protection settings for this brand">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
          <div>
            <p className="text-sm font-medium">Protection active</p>
            <p className="text-xs text-muted-foreground">When off, this rule raises no cases for the brand.</p>
          </div>
          <Toggle on={enabled} onChange={setEnabled} />
        </div>
        <Field
          label="Limit"
          value={threshold}
          onChange={(v) => setThreshold(v.replace(/\D/g, ''))}
          hint="How many before a case is raised. Whole numbers only."
          error={thresholdValid ? undefined : 'Enter a number above zero'}
        />
        <Field
          label="Window (hours)"
          type="number"
          value={hours}
          onChange={setHours}
          hint="The period the limit is measured over. Minimum 1 hour."
        />
        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'critical', label: 'Critical' },
          ]}
        />
        <Select
          label="Action"
          value={action}
          onChange={setAction}
          options={[
            { value: 'alert', label: 'Alert — raise a case only' },
            { value: 'flag', label: 'Flag — mark the subject for review' },
            { value: 'block', label: 'Block — stop the earning' },
          ]}
          hint="What happens when the limit is crossed."
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!thresholdValid}>Save rule</Button>
        </div>
      </div>
    </Modal>
  );
}
