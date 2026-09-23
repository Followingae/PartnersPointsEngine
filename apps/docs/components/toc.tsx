'use client';

import { useEffect, useState } from 'react';
import type { TocItem } from '../lib/content';

/** Sticky table of contents with a scroll-spy that follows the reader. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const onScroll = () => {
      const line = 120; // px from the top of the viewport
      let current = headings[0]!.id;
      for (const h of headings) {
        if (h.getBoundingClientRect().top - line <= 0) current = h.id;
        else break;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [items]);

  return (
    <nav className="toc" aria-label="On this page">
      <p className="mb-3 pl-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink/40">On this page</p>
      <div className="border-l border-border">
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`} data-depth={i.depth} data-active={active === i.id} className="-ml-px">
            {i.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
