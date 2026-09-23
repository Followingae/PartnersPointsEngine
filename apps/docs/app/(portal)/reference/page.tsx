import type { Metadata } from 'next';
import Link from 'next/link';
import { MethodBadge } from '../../../components/endpoint';
import { PageShell } from '../../../components/page-shell';
import { ENDPOINTS, ENDPOINT_GROUPS } from '../../../content/endpoints';

export const metadata: Metadata = { title: 'API reference' };
export const dynamic = 'force-static';

export default function ReferenceIndex() {
  return (
    <PageShell
      eyebrow="API reference"
      title="All endpoints"
      description="Fourteen endpoints under https://api.partnerspoints.ae/v1. Every one is signed the same way and returns the same error envelope."
    >
      <div className="space-y-10">
        {ENDPOINT_GROUPS.map((g) => {
          const items = ENDPOINTS.filter((e) => e.group === g);
          if (items.length === 0) return null;
          return (
            <section key={g}>
              <h2 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/45">{g}</h2>
              <div className="overflow-hidden rounded-xl border border-border">
                {items.map((e, i) => (
                  <Link
                    key={e.slug}
                    href={`/reference/${e.slug}`}
                    className={'flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-secondary ' + (i ? 'border-t border-border' : '')}
                  >
                    <span className="mt-[2px] w-12 shrink-0">
                      <MethodBadge method={e.method} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[0.85rem] text-ink">{e.path}</span>
                      <span className="mt-0.5 block text-[0.88rem] text-ink/60">{e.summary}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
