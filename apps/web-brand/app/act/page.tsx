'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { setToken } from '@/lib/api';

/** Entry point for superadmin "Manage as brand" — accepts a brand-scoped token, then enters the console. */
export default function ActPage() {
  const router = useRouter();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      setToken(token);
      router.replace('/');
    } else {
      router.replace('/login');
    }
  }, [router]);
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Signing in…</div>;
}
