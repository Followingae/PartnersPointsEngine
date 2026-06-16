'use client';

import clsx from 'clsx';
import { BarChart3, ChevronLeft, ChevronsUpDown, Coins, Gift, GitPullRequestArrow, History, KeyRound, Layers, LayoutDashboard, LineChart, LogOut, Mail, Megaphone, Settings, Target, Ticket, Trophy, Users, UsersRound, Webhook } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearToken, getModuleAccess, getSettings } from '@/lib/api';

// `module` = the entitlement key the superadmin toggles; undefined = always-on core module.
const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/reporting', label: 'Reporting & analytics', icon: LineChart, module: 'reporting' },
  { href: '/customers', label: 'Customers (RFM)', icon: BarChart3 },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/earn-rules', label: 'Earn rules', icon: Coins },
  { href: '/rewards', label: 'Rewards', icon: Gift },
  { href: '/tiers', label: 'Tiers', icon: Layers, module: 'tiers' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, module: 'campaigns' },
  { href: '/coupons', label: 'Coupons', icon: Ticket, module: 'coupons' },
  { href: '/segments', label: 'Segments', icon: Target, module: 'segments' },
  { href: '/gamification', label: 'Gamification', icon: Trophy, module: 'gamification' },
  { href: '/messaging', label: 'Messaging', icon: Mail, module: 'messaging' },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, module: 'webhooks' },
  { href: '/api-keys', label: 'API keys', icon: KeyRound, module: 'api-keys' },
  { href: '/change-requests', label: 'Change requests', icon: GitPullRequestArrow },
  { href: '/activity', label: 'Activity log', icon: History },
  { href: '/team', label: 'Team & access', icon: UsersRound, module: 'team' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const labelCls = (collapsed: boolean) =>
  clsx('whitespace-nowrap text-sm font-medium transition-opacity duration-200', collapsed ? 'pointer-events-none opacity-0' : 'opacity-100');

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [brand, setBrand] = useState<{ name: string } | null>(null);

  useEffect(() => {
    getModuleAccess().then((r) => setAccess(r.access)).catch(() => {});
    getSettings().then((s) => setBrand({ name: s.name })).catch(() => {});
  }, []);

  const items = NAV.filter((item) => !item.module || access[item.module] !== false);

  return (
    <aside className={clsx('fixed left-0 top-0 z-20 flex h-screen flex-col overflow-hidden border-r border-border/70 bg-ink py-4 transition-[width] duration-300 ease-in-out', collapsed ? 'w-[76px]' : 'w-[248px]')}>
      {/* brand logo */}
      <div className="flex h-11 items-center px-3.5">
        {collapsed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/partners-points-mark.png" alt="Partners Points" className="h-11 w-11 object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/partners-points-light.png" alt="Partners Points" className="h-9 w-auto object-contain" />
        )}
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2">
        {items.map((item) => {
          const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={clsx('flex h-11 items-center rounded-2xl transition', active ? 'bg-white/10 text-lime-400' : 'text-white/55 hover:bg-white/5 hover:text-white')}
            >
              <span className="grid w-[60px] shrink-0 place-items-center"><Icon size={20} /></span>
              <span className={labelCls(collapsed)}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 flex flex-col gap-1 px-2">
        <button onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} className="flex h-10 items-center rounded-2xl text-white/40 transition hover:bg-white/5 hover:text-white">
          <span className="grid w-[60px] shrink-0 place-items-center"><ChevronLeft size={18} className={clsx('transition-transform duration-300', collapsed && 'rotate-180')} /></span>
          <span className={labelCls(collapsed)}>Collapse</span>
        </button>
        <AccountMenu
          collapsed={collapsed}
          name={brand?.name ?? 'Your brand'}
          sub="Brand console"
          gradient="bg-gradient-lime"
          items={[{ label: 'Settings', icon: <Settings size={15} />, onClick: () => router.push('/settings') }]}
          onSignOut={() => { clearToken(); router.push('/login'); }}
        />
      </div>
    </aside>
  );
}

/** Bottom-left account switcher: avatar + name, click opens an upward popover (Settings, Sign out).
    Rendered in a portal so it never clips under the sidebar's `overflow-hidden`. */
export function AccountMenu({
  collapsed, name, sub, gradient, items, onSignOut,
}: {
  collapsed: boolean;
  name: string;
  sub: string;
  gradient: string;
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const initial = (name || 'B').charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', close); };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ left: r.left, bottom: window.innerHeight - r.top + 8, width: Math.max(r.width, 232) });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle} title={collapsed ? name : undefined} className="flex h-12 items-center rounded-2xl text-left transition hover:bg-white/5">
        <span className="grid w-[60px] shrink-0 place-items-center">
          <span className={clsx('grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-ink', gradient)}>{initial}</span>
        </span>
        <span className={clsx('flex min-w-0 flex-1 items-center gap-1 pr-2 transition-opacity duration-200', collapsed ? 'pointer-events-none opacity-0' : 'opacity-100')}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{name}</span>
            <span className="block truncate text-[11px] text-white/45">{sub}</span>
          </span>
          <ChevronsUpDown size={15} className="shrink-0 text-white/40" />
        </span>
      </button>

      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[200] overflow-hidden rounded-2xl border border-border bg-card py-1.5 text-foreground shadow-hero"
              style={{ left: coords.left, bottom: coords.bottom, width: coords.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-ink', gradient)}>{initial}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-border/70" />
              {items.map((it) => (
                <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-muted">
                  <span className="text-muted-foreground">{it.icon}</span>{it.label}
                </button>
              ))}
              <button onClick={() => { setOpen(false); onSignOut(); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-destructive transition hover:bg-destructive/10">
                <LogOut size={15} />Sign out
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
