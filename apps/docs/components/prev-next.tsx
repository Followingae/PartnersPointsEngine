import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { NavGroup } from '../content/nav';

/** Previous / next links across the whole navigation order. */
export function PrevNext({ nav, current }: { nav: NavGroup[]; current: string }) {
  const flat = nav.flatMap((g) => g.items.filter((i) => !i.external));
  const idx = flat.findIndex((i) => i.href === current);
  if (idx < 0) return null;
  const prev = flat[idx - 1];
  const next = flat[idx + 1];
  return (
    <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="group rounded-2xl border border-border p-5 transition-colors hover:border-ink/25">
          <span className="flex items-center gap-1.5 text-xs text-ink/50">
            <ArrowLeft size={13} /> Previous
          </span>
          <span className="mt-1 block font-semibold text-ink">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="group rounded-2xl border border-border p-5 text-right transition-colors hover:border-ink/25">
          <span className="flex items-center justify-end gap-1.5 text-xs text-ink/50">
            Next <ArrowRight size={13} />
          </span>
          <span className="mt-1 block font-semibold text-ink">{next.title}</span>
        </Link>
      ) : null}
    </div>
  );
}
