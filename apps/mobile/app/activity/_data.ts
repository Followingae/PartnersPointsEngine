/**
 * Sample ledger for screens 49/51.
 *
 * TODO(api): replace with GET /customer/activity — the engine already returns
 * grouped entries with the earn breakdown used on the detail screen.
 */
import { C, S } from '@/lib/tokens';

export type Kind = 'earn' | 'redeem' | 'convert';

export interface Entry {
  id: string;
  group: string;
  /** Brand swatch on the row — the brand's own colour. */
  tile: string;
  title: string;
  sub: string;
  amount: string;
  kind: Kind;
  /** Detail screen. */
  ref: string;
  when: string;
  bigLabel: string;
  lines: { label: string; value: string }[];
}

export const amountColor = (kind: Kind) =>
  kind === 'earn' ? S.earnInk : kind === 'redeem' ? S.spend : C.electric;

export const ENTRIES: Entry[] = [
  {
    id: '40912',
    group: 'Today',
    tile: C.orange,
    title: 'Camel Bean · JLT',
    sub: 'Earned · 2:41 PM',
    amount: '+120',
    kind: 'earn',
    ref: '#40912',
    when: 'Today · 2:41 PM',
    bigLabel: 'points earned',
    lines: [
      { label: 'Bill', value: 'AED 42.00' },
      { label: 'Earn rate', value: '1 pt / AED' },
      { label: 'Thursday bonus', value: '2×' },
      { label: 'Balance', value: '2,480 pts' },
    ],
  },
  {
    id: '40908',
    group: 'Today',
    tile: C.orange,
    title: 'Camel Bean',
    sub: 'Redeemed · free flat white',
    amount: '−450',
    kind: 'redeem',
    ref: '#40908',
    when: 'Today · 11:18 AM',
    bigLabel: 'points redeemed',
    lines: [
      { label: 'Reward', value: 'Free flat white' },
      { label: 'Cost', value: '450 pts' },
      { label: 'Voucher', value: 'CB-7741' },
      { label: 'Balance', value: '2,360 pts' },
    ],
  },
  {
    id: '40871',
    group: 'Yesterday',
    tile: C.green,
    title: 'Verde Market',
    sub: 'Earned · 6:02 PM',
    amount: '+68',
    kind: 'earn',
    ref: '#40871',
    when: 'Yesterday · 6:02 PM',
    bigLabel: 'points earned',
    lines: [
      { label: 'Bill', value: 'AED 68.00' },
      { label: 'Earn rate', value: '1 pt / AED' },
      { label: 'Balance', value: '2,810 pts' },
    ],
  },
  {
    id: '40863',
    group: 'Yesterday',
    tile: C.purple,
    title: 'Núr Pâtisserie',
    sub: 'Converted to Lulu',
    amount: '−1,000',
    kind: 'convert',
    ref: '#40863',
    when: 'Yesterday · 1:26 PM',
    bigLabel: 'points converted',
    lines: [
      { label: 'Partner', value: 'Lulu Happiness' },
      { label: 'Rate', value: '10 pts → 1 LHP' },
      { label: 'Received', value: '100 LHP' },
      { label: 'Balance', value: '2,742 pts' },
    ],
  },
  {
    id: '40790',
    group: '23 July',
    tile: C.blue,
    title: 'Bloom Coffee',
    sub: 'Earned · 8:12 AM',
    amount: '+42',
    kind: 'earn',
    ref: '#40790',
    when: '23 July · 8:12 AM',
    bigLabel: 'points earned',
    lines: [
      { label: 'Bill', value: 'AED 42.00' },
      { label: 'Earn rate', value: '1 pt / AED' },
      { label: 'Balance', value: '3,742 pts' },
    ],
  },
];

export const findEntry = (id?: string | string[]) =>
  ENTRIES.find((e) => e.id === (Array.isArray(id) ? id[0] : id)) ?? ENTRIES[0];

/** Groups in ledger order, without relying on object key ordering. */
export function grouped(entries: Entry[] = ENTRIES): { group: string; items: Entry[] }[] {
  const out: { group: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.group === e.group) last.items.push(e);
    else out.push({ group: e.group, items: [e] });
  }
  return out;
}
