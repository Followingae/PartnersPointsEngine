/**
 * Sample challenge + stamp-card content for screens 43/44.
 *
 * TODO(api): replace with GET /customer/challenges — the engine returns goal
 * challenges and repeatable stamp cards (with live stamp counts) in one list.
 */
import { C } from '@/lib/tokens';

export interface Challenge {
  id: string;
  /** Goals count up to a one-off bonus; stamp cards repeat and pay a reward. */
  kind: 'goal' | 'stamp';
  title: string;
  /** List sub-line, e.g. "Camel Bean · +200 pts". */
  meta: string;
  /** Pill on the list row. */
  status: string;
  done: number;
  total: number;
  color: string;
  /** Detail copy. */
  blurb: string;
  footLeft: string;
  footRight: string;
  reward: string;
  rewardSub: string;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'five-visits',
    kind: 'goal',
    title: 'Five visits this month',
    meta: 'Camel Bean · +200 pts',
    status: '3 of 5',
    done: 3,
    total: 5,
    color: C.orange,
    blurb: 'Visit Camel Bean five times before 31 July and earn 200 bonus points.',
    footLeft: '3 of 5 visits',
    footRight: '6 days left',
    reward: '+200 pts',
    rewardSub: 'Lands the day you finish',
  },
  {
    id: 'convert-twice',
    kind: 'goal',
    title: 'Convert to Lulu twice',
    meta: 'Any card · +150 pts',
    status: '1 of 2',
    done: 1,
    total: 2,
    color: C.purple,
    blurb: 'Move points to Lulu Happiness twice before 31 July and earn 150 bonus points.',
    footLeft: '1 of 2 conversions',
    footRight: '6 days left',
    reward: '+150 pts',
    rewardSub: 'Lands the day you finish',
  },
  {
    id: 'new-brand',
    kind: 'goal',
    title: 'Try a new brand',
    meta: 'Discover · +100 pts',
    status: 'Not started',
    done: 0,
    total: 1,
    color: C.green,
    blurb: 'Earn at a brand you have never visited before and pick up 100 bonus points.',
    footLeft: '0 of 1 brands',
    footRight: 'No deadline',
    reward: '+100 pts',
    rewardSub: 'Lands on your first earn',
  },
  {
    id: 'flat-white-card',
    kind: 'stamp',
    title: 'Buy 9, get 1 free',
    meta: 'Camel Bean · Stamp card',
    status: '2 more to go',
    done: 7,
    total: 9,
    color: C.orange,
    blurb: 'A stamp for every visit to Camel Bean. Fill the card and the tenth flat white is on the house.',
    footLeft: '7 of 9 stamps',
    footRight: 'Never expires',
    reward: 'Free flat white',
    rewardSub: 'Ready the moment the card fills',
  },
  {
    id: 'pastry-card',
    kind: 'stamp',
    title: 'Buy 5, get 1 free',
    meta: 'Núr Pâtisserie · Stamp card',
    status: 'Reward ready',
    done: 5,
    total: 5,
    color: C.pink,
    blurb: 'Five pastries earn the sixth. Your card is full — show your QR at the counter to claim it.',
    footLeft: '5 of 5 stamps',
    footRight: 'Claim in store',
    reward: 'Free pastry',
    rewardSub: 'Waiting at the counter',
  },
];

export const findChallenge = (id?: string | string[]) =>
  CHALLENGES.find((c) => c.id === (Array.isArray(id) ? id[0] : id)) ?? CHALLENGES[0];
