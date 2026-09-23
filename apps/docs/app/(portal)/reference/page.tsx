import type { Metadata } from 'next';
import { Toc } from '../../../components/toc';
import { loadReference } from '../../../lib/content';

export const metadata: Metadata = { title: 'POS Integration API reference' };
export const dynamic = 'force-static';

export default async function ReferencePage() {
  const ref = await loadReference();

  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto py-12 pr-2">
            <Toc items={ref.toc} />
          </div>
        </aside>

        <article className="min-w-0 py-12 lg:py-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{ref.version}</p>
          <div className="doc" dangerouslySetInnerHTML={{ __html: ref.html }} />
        </article>
      </div>
    </div>
  );
}
