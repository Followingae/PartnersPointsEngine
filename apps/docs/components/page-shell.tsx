import type { ReactNode } from 'react';
import { Toc } from './toc';
import type { TocItem } from '../lib/content';

/**
 * The reading column every documentation page uses: eyebrow, title, lede,
 * body, and an "on this page" rail on wide screens.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  toc,
  children,
  wide = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  toc?: TocItem[];
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={'flex gap-12 py-10 lg:pl-12 lg:py-12 ' + (wide ? '' : '')}>
      <article className={'min-w-0 flex-1 ' + (wide ? 'max-w-[980px]' : 'max-w-[760px]')}>
        {eyebrow ? <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.1rem] font-bold leading-[1.15] tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">{description}</p> : null}
        <div className="mt-10">{children}</div>
      </article>
      {toc && toc.length > 0 ? (
        <aside className="hidden w-[200px] shrink-0 xl:block">
          <div className="sticky top-24">
            <Toc items={toc} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
