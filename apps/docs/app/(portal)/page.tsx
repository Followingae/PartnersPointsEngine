import Link from 'next/link';
import { ArrowRight, BookOpen, KeyRound, ListTree } from 'lucide-react';
import { MethodBadge } from '../../components/endpoint';

const CARDS = [
  { href: '/quickstart', icon: BookOpen, title: 'Quickstart', body: 'Sign a request, read the config, identify a guest, award points. A working integration in four calls.' },
  { href: '/authentication', icon: KeyRound, title: 'Authentication', body: 'HMAC-SHA256 on every request. The header, the canonical string, reference code and the four common mistakes.' },
  { href: '/reference', icon: ListTree, title: 'API reference', body: 'All fourteen endpoints with request fields, response fields, examples and every error they return.' },
] as const;

const FLOW = [
  { step: 'Identify', text: 'Resolve a phone or scanned code into a member token.', href: '/reference/resolve-member', method: 'POST' as const, path: '/terminal/members/resolve' },
  { step: 'Show', text: 'Balance, tier and stamp progress for the cashier screen.', href: '/reference/member-context', method: 'POST' as const, path: '/terminal/members/context' },
  { step: 'Quote', text: 'Preview the points and the value of a redemption.', href: '/reference/quote', method: 'POST' as const, path: '/terminal/quotes' },
  { step: 'Redeem', text: 'Hold points, take payment, then capture or void.', href: '/reference/create-transaction', method: 'POST' as const, path: '/terminal/transactions' },
  { step: 'Earn', text: 'Award points with an idempotency key. Print the celebration.', href: '/reference/create-transaction', method: 'POST' as const, path: '/terminal/transactions' },
  { step: 'Receipt', text: 'Store the digital receipt behind the printed QR.', href: '/reference/create-receipt', method: 'POST' as const, path: '/terminal/receipts' },
];

const FACTS = [
  ['Base URL', 'https://api.partnerspoints.ae/v1'],
  ['Authentication', 'HMAC-SHA256 per request. No login call, no bearer tokens.'],
  ['Format', 'JSON, UTF-8. Money in minor units. Balances as decimal strings.'],
  ['Status codes', 'GET returns 200, successful POST returns 201. Errors use one envelope.'],
] as const;

export default function HomePage() {
  return (
    <div className="py-10 lg:pl-12 lg:py-12">
      <div className="max-w-[760px]">
        <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-brand">POS Integration API · v1</p>
        <h1 className="font-display text-[2.4rem] font-bold leading-[1.1] tracking-tight text-ink">Documentation</h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/60">
          Partners Points is a closed-loop loyalty engine. This API lets a point of sale identify a member, quote and award
          points, redeem rewards, store receipts and reconcile after an outage.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-border p-6 transition-colors hover:border-ink/30">
            <c.icon size={20} strokeWidth={1.75} className="text-brand" />
            <h2 className="mt-5 font-display text-[1.05rem] font-semibold text-ink">{c.title}</h2>
            <p className="mt-1.5 text-[0.9rem] leading-relaxed text-ink/60">{c.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[0.85rem] font-medium text-brand">
              Read <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-16 max-w-[980px]">
        <h2 className="font-display text-[1.35rem] font-semibold text-ink">A sale, end to end</h2>
        <p className="mt-1.5 text-[0.95rem] text-ink/60">The calls a register makes while a guest is at the counter, in order.</p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          {FLOW.map((f, i) => (
            <Link key={f.step + i} href={f.href} className={'grid grid-cols-[2rem_7rem_1fr] items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary sm:grid-cols-[2rem_7rem_1fr_auto] ' + (i ? 'border-t border-border' : '')}>
              <span className="font-mono text-[0.75rem] text-ink/40">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-semibold text-ink">{f.step}</span>
              <span className="text-[0.92rem] text-ink/65">{f.text}</span>
              <span className="hidden items-center gap-2 sm:flex">
                <MethodBadge method={f.method} size="sm" />
                <code className="font-mono text-[0.78rem] text-ink/60">{f.path}</code>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 max-w-[980px]">
        <h2 className="font-display text-[1.35rem] font-semibold text-ink">Conventions</h2>
        <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {FACTS.map(([k, v]) => (
            <div key={k} className="bg-white px-5 py-4">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink/45">{k}</dt>
              <dd className="mt-1 text-[0.92rem] leading-relaxed text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
