import Link from 'next/link';
import { ArrowRight, Download, Gift, RefreshCw, ShieldCheck, UserRound, Wallet } from 'lucide-react';

const PILLARS = [
  {
    icon: UserRound,
    title: 'Identify',
    body: 'Resolve a phone number or scanned code into a member token, enrol new customers at the till, and show the cashier who they are talking to.',
    href: '/reference#4-identifying-a-customer',
    endpoints: ['members/resolve', 'members/enroll', 'members/context'],
  },
  {
    icon: Wallet,
    title: 'Earn',
    body: 'Quote the points a sale will award, then post it with an idempotency key so a retry after a timeout can never double-award.',
    href: '/reference#5-taking-a-sale',
    endpoints: ['quotes', 'transactions'],
  },
  {
    icon: Gift,
    title: 'Redeem',
    body: 'Spending points is authorize-then-capture, so a hold is released automatically if the card payment fails. Vouchers work the same way.',
    href: '/reference#6-rewards',
    endpoints: ['transactions/{id}/capture', 'transactions/{id}/void', 'vouchers/redeem'],
  },
  {
    icon: RefreshCw,
    title: 'Recover',
    body: 'Tills lose connectivity. Queue the loyalty call, take the payment, and replay in a batch later. Receipts back the QR you print.',
    href: '/reference#9-offline',
    endpoints: ['transactions/batch', 'receipts', 'config'],
  },
] as const;

const ORDER = [
  ['Sign a request', 'Sign GET /terminal/diagnostics/ping until it returns 200.', '/reference#25-verifying-your-implementation'],
  ['Read the config', 'Cache it, and use the brand’s own points name in your UI.', '/reference#7-configuration'],
  ['Resolve and display', 'Resolve → context → show balance and stamp progress.', '/reference#4-identifying-a-customer'],
  ['Award points', 'Earn on completed sales, one idempotency key per sale.', '/reference#52-award-points'],
  ['Enrol', 'Offer enrolment for unrecognised phone numbers.', '/reference#42-enrol-at-the-till'],
  ['Rewards', 'List, apply, and make sure every authorize reaches capture or void.', '/reference#6-rewards'],
  ['Offline', 'Queue and replay with the batch endpoint.', '/reference#9-offline'],
  ['Receipts', 'Digital copies behind the printed QR.', '/reference#8-receipts'],
] as const;

const FACTS = [
  ['Base URL', 'https://api.partnerspoints.ae/v1'],
  ['Authentication', 'HMAC-SHA256 per request, no login call'],
  ['Money', 'Minor units, integers only'],
  ['Balances', '64-bit integers, returned as strings'],
] as const;

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="pb-20 pt-20 sm:pt-28">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-brand">POS Integration API · Version 1</p>
        <h1 className="max-w-3xl font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          Put loyalty on every bill, from the till you already run.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink/60">
          Partners Points is a closed-loop loyalty engine. This API lets a point of sale identify a member, quote and
          award points, redeem rewards, and reconcile after an outage. Four calls make a working integration.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/reference"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ink-muted"
          >
            Read the reference <ArrowRight size={16} />
          </Link>
          <a
            href="/openapi.json"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-ink transition-colors hover:border-ink/30"
          >
            <Download size={16} /> OpenAPI 3 spec
          </a>
        </div>
      </section>

      {/* Facts */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        {FACTS.map(([k, v]) => (
          <div key={k} className="bg-white px-6 py-5">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink/40">{k}</p>
            <p className="mt-1.5 break-all font-mono text-[0.9rem] text-ink">{v}</p>
          </div>
        ))}
      </section>

      {/* Pillars */}
      <section className="py-24">
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink">What the API covers</h2>
        <p className="mt-3 max-w-xl text-ink/60">Fourteen endpoints, grouped by what a cashier is doing at that moment.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <Link
              key={p.title}
              href={p.href}
              className="group rounded-3xl border border-border bg-white p-8 transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_12px_40px_-20px_rgba(16,16,18,0.25)]"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                <p.icon size={20} strokeWidth={1.75} />
              </span>
              <h3 className="mt-6 font-display text-xl font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/60">{p.body}</p>
              <ul className="mt-5 flex flex-wrap gap-1.5">
                {p.endpoints.map((e) => (
                  <li key={e} className="rounded-md bg-secondary px-2 py-1 font-mono text-[0.72rem] text-ink/70">
                    {e}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>

      {/* Integration order */}
      <section className="grid gap-12 border-t border-border py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink">Suggested order</h2>
          <p className="mt-3 text-ink/60">
            Steps one to four are a working integration. The rest can follow, and none of it blocks a payment.
          </p>
          <Link href="/reference#11-checklist-before-going-live" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck size={16} /> Checklist before going live
          </Link>
        </div>
        <ol className="space-y-1">
          {ORDER.map(([title, body, href], i) => (
            <li key={title}>
              <Link href={href} className="group flex gap-5 rounded-2xl px-4 py-4 transition-colors hover:bg-secondary">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white font-mono text-xs text-ink/60 group-hover:border-ink/30">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="block text-[0.95rem] text-ink/60">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
