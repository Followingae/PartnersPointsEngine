'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@camel-bean.dev');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await login(email, password);
      if (r.accessToken) {
        setToken(r.accessToken);
        router.push('/');
      } else if (r.mfaRequired) {
        setError('MFA is enabled for this account (not wired in this demo UI).');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-ink p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gradient-lime opacity-20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-gradient-teal opacity-20 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partners-points-light.png" alt="Partners Points" className="h-12 w-auto max-w-[240px] object-contain" />
        <div className="relative">
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">
            Run your
            <br />
            loyalty program
            <br />
            <span className="text-lime-400">like a pro.</span>
          </h1>
          <p className="mt-6 max-w-md text-white/60">
            Points, tiers, campaigns, RFM insights, and rewards — one closed-loop engine for your brand.
          </p>
        </div>
        <p className="relative text-sm text-white/40">Brand console · v1</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/partners-points.png" alt="Partners Points" className="mb-8 h-10 w-auto max-w-[220px] object-contain lg:hidden" />
          <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your brand console.</p>

          <label className="mt-8 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
          />
          <label className="mt-4 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
          />

          {error ? <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="mt-6 rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Demo: <span className="font-mono">admin@camel-bean.dev</span> / <span className="font-mono">ChangeMe123!</span>
          </p>
        </form>
      </div>
    </div>
  );
}
