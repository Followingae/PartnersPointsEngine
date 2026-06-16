'use client';

import clsx from 'clsx';
import { Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getToken } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
    setCollapsed(window.localStorage.getItem('rfm_sa_sidebar_collapsed') === '1');
  }, [router]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem('rfm_sa_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  if (!ready) return null;

  return (
    <ToastProvider>
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {mobileOpen ? <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} /> : null}

      <div className={clsx('min-h-screen transition-[padding] duration-300 ease-in-out', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-white">
            <Menu size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/partners-points.png" alt="Partners Points" className="h-6 w-auto object-contain" />
        </header>

        <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </ToastProvider>
  );
}
