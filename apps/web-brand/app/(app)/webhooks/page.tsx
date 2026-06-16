'use client';

import { Copy, KeyRound, Plus, Power, Send, Trash2, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  deleteWebhook, getWebhookDeliveries, getWebhookEventTypes, getWebhooks, registerWebhook, rotateWebhookSecret, testWebhook, updateWebhook,
  type WebhookDeliveryRow, type WebhookEndpointRow,
} from '@/lib/api';

export default function WebhooksPage() {
  const toast = useToast();
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WebhookEndpointRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getWebhooks(), getWebhookDeliveries()])
      .then(([e, d]) => { setEndpoints(e); setDeliveries(d.rows); })
      .catch((err) => toast('error', err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  async function toggle(e: WebhookEndpointRow) {
    try { await updateWebhook(e.id, { enabled: !e.enabled }); toast('success', e.enabled ? 'Disabled' : 'Enabled'); load(); }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Failed'); }
  }
  async function test(e: WebhookEndpointRow) {
    try { const r = await testWebhook(e.id); toast(r.ok ? 'success' : 'error', r.ok ? `Test delivered (HTTP ${r.status})` : `Test failed (${r.error ?? r.status})`); load(); }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Failed'); }
  }
  async function rotate(e: WebhookEndpointRow) {
    try { const r = await rotateWebhookSecret(e.id); setSecret(r.secret); toast('success', 'Secret rotated'); }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Failed'); }
  }
  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try { await deleteWebhook(toDelete.id); toast('success', 'Endpoint deleted'); setToDelete(null); load(); }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Webhooks" action={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add endpoint</Button>} />

      <Card className="p-5">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : endpoints.length === 0 ? (
          <EmptyState icon={<Webhook size={22} />} title="No endpoints" hint="Add an HTTPS endpoint to receive signed loyalty events." action={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add endpoint</Button>} />
        ) : (
          <div className="space-y-3">
            {endpoints.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-coral text-ink"><Webhook size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{e.url}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.events.join(', ')}</p>
                </div>
                <Badge tone={e.enabled ? 'lime' : 'neutral'}>{e.enabled ? 'active' : 'off'}</Badge>
                <ActionMenu actions={[
                  { label: 'Send test', icon: <Send size={14} />, onClick: () => test(e) },
                  { label: e.enabled ? 'Disable' : 'Enable', icon: <Power size={14} />, onClick: () => toggle(e) },
                  { label: 'Rotate secret', icon: <KeyRound size={14} />, onClick: () => rotate(e) },
                  { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(e) },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-display text-lg font-semibold">Recent deliveries</h2>
        {deliveries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Attempts</th><th className="px-4 py-3 font-semibold">When</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{d.eventType}</td>
                    <td className="px-4 py-3"><Badge tone={d.status === 'delivered' ? 'lime' : d.status === 'dead' ? 'coral' : 'neutral'}>{d.status}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{d.attempts}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding ? <AddEndpoint onClose={() => setAdding(false)} onDone={(s) => { setAdding(false); setSecret(s); load(); }} /> : null}
      {secret ? <SecretModal secret={secret} onClose={() => setSecret(null)} /> : null}
      <ConfirmDialog open={toDelete !== null} onClose={() => setToDelete(null)} onConfirm={onDelete} loading={busy} title="Delete endpoint?" message="Deliveries to this endpoint will stop." />
    </div>
  );
}

function AddEndpoint({ onClose, onDone }: { onClose: () => void; onDone: (secret: string) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('https://');
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(['*']));
  const [errors, setErrors] = useState<{ url?: string }>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { getWebhookEventTypes().then(setAllEvents).catch(() => {}); }, []);

  const toggle = (ev: string) => setSelected((s) => { const n = new Set(s); n.has(ev) ? n.delete(ev) : n.add(ev); return n; });

  async function submit() {
    if (!/^https?:\/\/.+/.test(url)) { setErrors({ url: 'Enter a valid URL' }); return; }
    const events = selected.has('*') ? ['*'] : [...selected];
    if (!events.length) { toast('error', 'Select at least one event'); return; }
    setSaving(true);
    try { const r = await registerWebhook({ url, events }); toast('success', 'Endpoint added'); onDone(r.secret); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Add webhook endpoint" subtitle="We sign every delivery with HMAC-SHA256">
      <div className="space-y-4">
        <Field label="Endpoint URL" value={url} onChange={setUrl} placeholder="https://example.com/hooks/loyalty" required error={errors.url} />
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={selected.has('*')} onChange={() => setSelected(selected.has('*') ? new Set() : new Set(['*']))} className="h-4 w-4 accent-ink" />
            All events (*)
          </label>
          {!selected.has('*') ? (
            <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-2xl border border-border/70 p-3">
              {allEvents.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(ev)} onChange={() => toggle(ev)} className="h-4 w-4 accent-ink" />
                  <span className="font-mono text-xs">{ev}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Add endpoint</Button>
        </div>
      </div>
    </Modal>
  );
}

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title="Signing secret" subtitle="Copy it now — it won't be shown again">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-3">
          <code className="flex-1 truncate font-mono text-sm">{secret}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(secret); toast('success', 'Copied'); }}><Copy size={14} /> Copy</Button>
        </div>
        <p className="text-xs text-muted-foreground">Verify deliveries with the <code className="font-mono">X-Loyalty-Signature</code> header (<code className="font-mono">t=…,v1=HMAC-SHA256(t.body)</code>).</p>
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}
