'use client';

import clsx from 'clsx';
import { Bell, Check, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader } from '@/components/form';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  getNotifications, markAllNotificationsRead, markNotificationRead,
  type NotificationRow, type NotificationSeverity,
} from '@/lib/api';

const TONE: Record<NotificationSeverity, 'coral' | 'teal' | 'neutral'> = {
  critical: 'coral', high: 'coral', medium: 'neutral', low: 'teal', info: 'teal',
};

export default function NotificationsPage() {
  const toast = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getNotifications(filter, 100)
      .then(setRows)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [filter, toast]);
  useEffect(() => load(), [load]);

  async function open(n: NotificationRow) {
    if (!n.read) { try { await markNotificationRead(n.id); } catch { /* best effort */ } }
    if (n.link) router.push(n.link);
    else load();
  }

  async function markAll() {
    try { await markAllNotificationsRead(); toast('success', 'All marked read'); load(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div>
      <PageHeader
        subtitle="Platform console"
        title="Notifications"
        action={<Button variant="outline" onClick={markAll}><Check size={16} /> Mark all read</Button>}
      />

      <div className="mb-4 flex gap-2">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              filter === f ? 'bg-ink text-white' : 'border border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {f === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Inbox size={22} />} title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'} hint="Fraud and system alerts across the platform will appear here." />
        ) : (
          <div className="space-y-2">
            {rows.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={clsx(
                  'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:bg-muted/50',
                  n.read ? 'border-border/60 bg-transparent' : 'border-border bg-muted/30',
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-coral text-ink"><Bell size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{n.title}</p>
                    <Badge tone={TONE[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                    {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#1b5cff]" /> : null}
                  </div>
                  {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {new Date(n.createdAt).toLocaleString()} · {n.source}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
