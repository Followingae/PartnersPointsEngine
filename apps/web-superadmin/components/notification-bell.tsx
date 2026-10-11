'use client';

import { Bell, Check, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNotificationUnreadCount, getNotifications, markAllNotificationsRead, markNotificationRead,
  type NotificationRow, type NotificationSeverity,
} from '@/lib/api';

const POLL_MS = 45_000;

const DOT: Record<NotificationSeverity, string> = {
  critical: '#e0567a',
  high: '#e0567a',
  medium: '#d9922b',
  low: '#3bb0a8',
  info: '#3bb0a8',
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Topbar notification bell: an unread badge driven by lightweight polling, and a
 * dropdown of recent items. Polling (not sockets) matches this platform, which
 * runs interval workers with no realtime channel. Fails quiet — a notification
 * feed must never be able to break the console.
 */
export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    getNotificationUnreadCount().then((r) => setCount(r.count)).catch(() => {});
  }, []);

  // Poll the unread count; pause when the tab is hidden, refresh on focus.
  useEffect(() => {
    refreshCount();
    const tick = () => { if (document.visibilityState === 'visible') refreshCount(); };
    const timer = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', refreshCount);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshCount]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const loadItems = useCallback(() => {
    setLoading(true);
    getNotifications('all', 12)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  async function openItem(n: NotificationRow) {
    setOpen(false);
    if (!n.read) {
      try { await markNotificationRead(n.id); } catch { /* best effort */ }
      refreshCount();
    }
    router.push(n.link || '/notifications');
  }

  async function markAll() {
    try { await markAllNotificationsRead(); } catch { /* best effort */ }
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setCount(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
        className="relative grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-foreground/70 transition hover:bg-muted hover:text-foreground"
      >
        <Bell size={18} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-[#e0567a] px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[120] mt-2 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-hero">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <Check size={13} /> Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <Inbox size={22} /> You're all caught up.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition hover:bg-muted/60 ${n.read ? 'opacity-70' : ''}`}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT[n.severity] ?? '#3bb0a8' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{n.title}</span>
                      {!n.read ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1b5cff]" /> : null}
                    </span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => { setOpen(false); router.push('/notifications'); }}
            className="block w-full border-t border-border/70 px-4 py-3 text-center text-sm font-medium text-[#1b5cff] transition hover:bg-muted/60"
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
}
