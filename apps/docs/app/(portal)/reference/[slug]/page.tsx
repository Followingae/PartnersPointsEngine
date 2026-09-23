import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EndpointPage } from '../../../../components/endpoint';
import { PrevNext } from '../../../../components/prev-next';
import { ENDPOINTS, endpointBySlug } from '../../../../content/endpoints';
import { NAV } from '../../../../content/nav';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return ENDPOINTS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = endpointBySlug(slug);
  return { title: e ? `${e.title} · API reference` : 'API reference', description: e?.summary };
}

export default async function ReferenceEndpointPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = endpointBySlug(slug);
  if (!e) notFound();
  return (
    <div className="pr-0 lg:pr-4">
      <EndpointPage endpoint={e} />
      <div className="max-w-[720px] lg:pl-12">
        <PrevNext nav={NAV} current={`/reference/${slug}`} />
      </div>
    </div>
  );
}
