'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getToken } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
    setCollapsed(window.localStorage.getItem('rfm_sidebar_collapsed') === '1');
  }, [router]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem('rfm_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  if (!ready) return null;

  return (
    <ToastProvider>
      <div className={clsx('min-h-screen transition-[padding] duration-300 ease-in-out', collapsed ? 'pl-[76px]' : 'pl-[248px]')}>
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <main className="mx-auto max-w-[1240px] px-8 py-9">{children}</main>
      </div>
    </ToastProvider>
  );
}
