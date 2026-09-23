import { ENDPOINTS } from './endpoints';

export type NavItem = { title: string; href: string; method?: 'GET' | 'POST'; external?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

/** Guide pages, in reading order. Each has a matching content/guides/<slug>.md. */
export const GUIDES: { slug: string; title: string; group: string }[] = [
  { slug: 'introduction', title: 'Introduction', group: 'Getting started' },
  { slug: 'quickstart', title: 'Quickstart', group: 'Getting started' },
  { slug: 'authentication', title: 'Authentication', group: 'Getting started' },
  { slug: 'errors', title: 'Errors', group: 'Getting started' },
  { slug: 'idempotency', title: 'Idempotency and retries', group: 'Getting started' },
  { slug: 'going-live', title: 'Going live', group: 'Getting started' },
  { slug: 'identify-customers', title: 'Identify a customer', group: 'Guides' },
  { slug: 'take-a-sale', title: 'Take a sale', group: 'Guides' },
  { slug: 'rewards', title: 'Rewards and vouchers', group: 'Guides' },
  { slug: 'configuration', title: 'Configuration and valuation', group: 'Guides' },
  { slug: 'receipts', title: 'Receipts', group: 'Guides' },
  { slug: 'offline', title: 'Offline and replay', group: 'Guides' },
  { slug: 'changelog', title: 'Changelog', group: 'Resources' },
  { slug: 'support', title: 'Support', group: 'Resources' },
];

function guideItems(group: string): NavItem[] {
  return GUIDES.filter((g) => g.group === group).map((g) => ({ title: g.title, href: `/${g.slug}` }));
}

export const NAV: NavGroup[] = [
  { title: 'Getting started', items: guideItems('Getting started') },
  { title: 'Guides', items: guideItems('Guides') },
  {
    title: 'API reference',
    items: [
      { title: 'All endpoints', href: '/reference' },
      ...ENDPOINTS.map((e) => ({ title: e.title, href: `/reference/${e.slug}`, method: e.method })),
    ],
  },
  {
    title: 'Resources',
    items: [{ title: 'OpenAPI 3 document', href: '/openapi.json', external: true }, ...guideItems('Resources')],
  },
];

export function groupOf(href: string): string {
  for (const g of NAV) if (g.items.some((i) => i.href === href)) return g.title;
  return 'Documentation';
}
