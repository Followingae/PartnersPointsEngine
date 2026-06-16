'use client';

import { History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, SearchInput, TableSkeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getPlatformAuditLogs, type PlatformAuditRow } from '@/lib/api';

function tone(action: string): 'lime' | 'coral' | 'teal' | 'neutral' {
  if (/(delete|archive|suspend|reject|revoke)/.test(action)) return 'coral';
  if (/(create|approve|generate)/.test(action)) return 'lime';
  if (/(update|set|rotate|clone|reactivate)/.test(action)) return 'teal';
  return 'neutral';
}

export default function PlatformAuditPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PlatformAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getPlatformAuditLogs(q || undefined).then((r) => { setRows(r.rows); setTotal(r.total); }).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [q, toast]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      <PageHeader subtitle="Platform" title="Audit log" action={<Badge tone="neutral">{total} events</Badge>} />
      <Card className="p-5">
        <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search actions…" /></div>
        {loading ? (
          <TableSkeleton rows={10} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="No audit events" hint="Every platform + brand mutation is recorded here, tamper-evident." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3 font-semibold">Action</th><th className="px-4 py-3 font-semibold">Target</th><th className="px-4 py-3 font-semibold">Actor</th><th className="px-4 py-3 font-semibold">When</th></tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3"><Badge tone={tone(r.action)}>{r.action}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.targetType ? <span className="capitalize">{r.targetType.replace(/_/g, ' ')}</span> : '—'}
                      {(r.data?.name as string) ? <span className="ml-1 font-medium text-foreground">· {String(r.data.name)}</span> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.actorType}:{r.actorId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
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
