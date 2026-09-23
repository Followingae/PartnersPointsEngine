import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '../../../components/page-shell';
import { GUIDES, NAV, groupOf } from '../../../content/nav';
import { loadGuide } from '../../../lib/content';
import { PrevNext } from '../../../components/prev-next';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await loadGuide(slug);
  return { title: guide?.title ?? 'Documentation', description: guide?.description };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await loadGuide(slug);
  if (!guide) notFound();
  const href = `/${slug}`;
  return (
    <PageShell eyebrow={groupOf(href)} title={guide.title} description={guide.description} toc={guide.toc}>
      <div className="doc" dangerouslySetInnerHTML={{ __html: guide.html }} />
      <PrevNext nav={NAV} current={href} />
    </PageShell>
  );
}
