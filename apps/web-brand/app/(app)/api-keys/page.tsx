'use client';

import { Copy, KeyRound, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Modal, PageHeader } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createApiKey, getApiKeys, revokeApiKey, rotateApiKey, type ApiKeyRow } from '@/lib/api';

export default function ApiKeysPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<{ publishableId?: string; secret: string } | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKeyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getApiKeys().then(setRows).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  async function create() {
    try { const r = await createApiKey(); setSecret({ publishableId: r.publishableId, secret: r.secret }); toast('success', 'API key issued'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }
  async function rotate(k: ApiKeyRow) {
    try { const r = await rotateApiKey(k.id); setSecret({ publishableId: k.publishableId, secret: r.secret }); toast('success', 'Secret rotated'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }
  async function onRevoke() {
    if (!toRevoke) return;
    setBusy(true);
    try { await revokeApiKey(toRevoke.id); toast('success', 'Key revoked'); setToRevoke(null); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="API keys" action={<Button onClick={create}><Plus size={16} /> Issue key</Button>} />
      <Card className="p-5">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<KeyRound size={22} />} title="No API keys" hint="Issue a key for server-to-server integrations." action={<Button onClick={create}><Plus size={16} /> Issue key</Button>} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Publishable ID</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Created</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((k) => (
                  <tr key={k.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{k.publishableId}</td>
                    <td className="px-4 py-3"><Badge tone={k.status === 'active' ? 'lime' : 'coral'}>{k.status}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <ActionMenu actions={[
                        { label: 'Rotate secret', icon: <KeyRound size={14} />, onClick: () => rotate(k) },
                        { label: 'Revoke', danger: true, onClick: () => setToRevoke(k) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {secret ? (
        <Modal open onClose={() => setSecret(null)} title="API secret" subtitle="Copy it now — it won't be shown again">
          <div className="space-y-4">
            {secret.publishableId ? <div className="rounded-2xl border border-border bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Publishable ID</p><code className="font-mono text-sm">{secret.publishableId}</code></div> : null}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-3">
              <code className="flex-1 truncate font-mono text-sm">{secret.secret}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(secret.secret); toast('success', 'Copied'); }}><Copy size={14} /> Copy</Button>
            </div>
            <div className="flex justify-end"><Button onClick={() => setSecret(null)}>Done</Button></div>
          </div>
        </Modal>
      ) : null}
      <ConfirmDialog open={toRevoke !== null} onClose={() => setToRevoke(null)} onConfirm={onRevoke} loading={busy} title="Revoke API key?" message="Integrations using this key will stop working immediately." confirmLabel="Revoke" />
    </div>
  );
}
