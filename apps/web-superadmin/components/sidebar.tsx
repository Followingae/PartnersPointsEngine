'use client';

import clsx from 'clsx';
import { Building2, ChevronLeft, ChevronsUpDown, GitPullRequestArrow, Handshake, History, LayoutDashboard, LineChart, LogOut, Scale, Search, Settings, Store, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearToken } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/merchants', label: 'Merchants', icon: Building2 },
  { href: '/brands', label: 'Brands', icon: Store },
  { href: '/billing', label: 'Wallet & billing', icon: Wallet },
  { href: '/approvals', label: 'Approvals', icon: GitPullRequestArrow },
  { href: '/governance', label: 'Governance', icon: Scale },
  { href: '/partnerships', label: 'Partnerships', icon: Handshake },
  { href: '/team', label: 'Team & roles', icon: Users },
  { href: '/audit', label: 'Audit log', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const labelCls = (collapsed: boolean) =>
  clsx('whitespace-nowrap text-sm font-medium transition-opacity duration-200', collapsed && 'lg:pointer-events-none lg:opacity-0');

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 flex h-screen w-[248px] flex-col overflow-hidden border-r border-border/70 bg-ink py-4 transition-all duration-300 ease-in-out lg:translate-x-0',
        collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-11 items-center px-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partners-points-light.png" alt="Partners Points" className={clsx('h-9 w-auto object-contain', collapsed && 'lg:hidden')} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partners-points-mark.png" alt="Partners Points" className={clsx('hidden h-11 w-11 object-contain', collapsed && 'lg:block')} />
      </div>

      <button
        onClick={() => { onMobileClose(); window.dispatchEvent(new Event('open-search')); }}
        title="Search (⌘K)"
        className="mx-2 mt-4 flex h-10 items-center rounded-2xl bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white"
      >
        <span className="grid w-[60px] shrink-0 place-items-center"><Search size={18} /></span>
        <span className={labelCls(collapsed)}>Search</span>
        <kbd className={clsx('mr-3 ml-auto rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/40', collapsed && 'lg:hidden')}>⌘K</kbd>
      </button>

      <nav className="mt-3 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2">
        {NAV.map((item) => {
          const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
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
        <button onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} className="hidden h-10 items-center rounded-2xl text-white/40 transition hover:bg-white/5 hover:text-white lg:flex">
          <span className="grid w-[60px] shrink-0 place-items-center"><ChevronLeft size={18} className={clsx('transition-transform duration-300', collapsed && 'rotate-180')} /></span>
          <span className={labelCls(collapsed)}>Collapse</span>
        </button>
        <AccountMenu
          collapsed={collapsed}
          name="Platform"
          sub="Superadmin console"
          items={[{ label: 'Team & roles', icon: <Users size={15} />, onClick: () => { onMobileClose(); router.push('/team'); } }, { label: 'Governance', icon: <Scale size={15} />, onClick: () => { onMobileClose(); router.push('/governance'); } }]}
          onSignOut={() => { clearToken(); router.push('/login'); }}
        />
      </div>
    </aside>
  );
}

/** Bottom-left account menu: avatar + name, click opens an upward popover. Portal-rendered to avoid sidebar clipping. */
function AccountMenu({
  collapsed, name, sub, items, onSignOut,
}: {
  collapsed: boolean;
  name: string;
  sub: string;
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const initial = name.charAt(0).toUpperCase();

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
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-coral text-sm font-bold text-ink">{initial}</span>
        </span>
        <span className={clsx('flex min-w-0 flex-1 items-center gap-1 pr-2 transition-opacity duration-200', collapsed && 'lg:pointer-events-none lg:opacity-0')}>
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
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-coral text-sm font-bold text-ink">{initial}</span>
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
