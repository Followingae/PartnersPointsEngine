'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from '../content/nav';

const METHOD_CLASS: Record<string, string> = {
  GET: 'text-emerald-700 bg-emerald-50',
  POST: 'text-brand bg-brand-50',
};

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar" aria-label="Documentation">
      {groups.map((g) => (
        <div key={g.title} className="mb-7">
          <p className="mb-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink/40">{g.title}</p>
          <ul>
            {g.items.map((item) => {
              const active = !item.external && pathname === item.href;
              const cls =
                'flex items-center gap-2 rounded-lg px-3 py-[7px] text-[0.875rem] leading-5 transition-colors ' +
                (active ? 'bg-ink text-white' : 'text-ink/75 hover:bg-secondary hover:text-ink');
              const inner = (
                <>
                  {item.method ? (
                    <span
                      className={
                        'inline-flex w-11 shrink-0 justify-center rounded-md py-[1px] font-mono text-[0.62rem] font-semibold tracking-wide ' +
                        (active ? 'bg-white/15 text-white' : METHOD_CLASS[item.method] ?? 'bg-secondary text-ink/60')
                      }
                    >
                      {item.method}
                    </span>
                  ) : null}
                  <span className="truncate">{item.title}</span>
                </>
              );
              return (
                <li key={item.href}>
                  {item.external ? (
                    <a href={item.href} className={cls} target="_blank" rel="noreferrer">
                      {inner}
                    </a>
                  ) : (
                    <Link href={item.href} className={cls}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
