'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/reference', label: 'Reference' },
  { href: '/openapi.json', label: 'OpenAPI', external: true },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {LINKS.map((l) => {
        const active = 'external' in l ? false : l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        const cls =
          'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
          (active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-secondary hover:text-ink');
        return 'external' in l ? (
          <a key={l.href} href={l.href} className={cls} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        ) : (
          <Link key={l.href} href={l.href} className={cls}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
