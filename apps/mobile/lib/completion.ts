/**
 * The six things the profile asks for, and which are still outstanding.
 *
 * One list, because it drives four surfaces that must agree: the meter on
 * Cards, the checklist on Profile, which prompt fires, and the "one answer
 * left" line on the saved toast. Two of them disagreeing is how a customer
 * ends up being asked for something they already gave.
 *
 * Nothing here promises points. The design carried "+50 pts" and "+100 pts"
 * against two of these; the platform does not pay for personal information and
 * the copy says what the answer is actually for instead.
 */
import type { Profile } from '@/lib/api';

export interface CompletionItem {
  key: 'fullName' | 'phone' | 'email' | 'birthdate' | 'nationality' | 'homeBranch';
  label: string;
  /** Why it helps them — never what it pays. */
  why: string;
  done: boolean;
  /** What to show when it is answered: the value itself, where that reads well. */
  value: string | null;
  /** Where answering happens. */
  href: string;
}

const monthName = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
};

export function completionItems(p: Profile | undefined): CompletionItem[] {
  return [
    {
      key: 'fullName',
      label: 'Name',
      why: 'So a cashier can greet you properly',
      done: Boolean(p?.fullName),
      value: p?.fullName ?? null,
      href: '/profile/edit',
    },
    {
      key: 'phone',
      label: 'Phone',
      // Always answered: it is what they signed in with.
      why: 'How you sign in and how a till finds you',
      done: Boolean(p?.phone),
      value: p?.phone ?? null,
      href: '/profile/edit',
    },
    {
      key: 'email',
      label: 'Email',
      why: 'For vouchers and receipts',
      done: Boolean(p?.email),
      value: p?.email ?? null,
      href: '/profile/edit',
    },
    {
      key: 'birthdate',
      label: 'Birthday',
      why: 'So a brand can send you something on the day',
      done: Boolean(p?.birthdate),
      value: p?.birthdate ? monthName(p.birthdate) : null,
      href: '/prompts/birthday',
    },
    {
      key: 'nationality',
      label: 'Nationality',
      why: 'Brands use it to plan menus and stock',
      done: Boolean(p?.nationality),
      value: p?.nationalityName ?? null,
      href: '/prompts/nationality',
    },
    {
      key: 'homeBranch',
      label: 'Home area',
      why: 'Offers from branches near you, not the other side of the country',
      done: Boolean(p?.homeBranchId),
      value: p?.homeBranchName ?? null,
      href: '/prompts/home-branch',
    },
  ];
}

export interface Completion {
  items: CompletionItem[];
  done: number;
  total: number;
  /** 0–1, for the meter. */
  fraction: number;
  outstanding: CompletionItem[];
  complete: boolean;
}

export function completion(p: Profile | undefined): Completion {
  const items = completionItems(p);
  const done = items.filter((i) => i.done).length;
  return {
    items,
    done,
    total: items.length,
    fraction: done / items.length,
    outstanding: items.filter((i) => !i.done),
    complete: done === items.length,
  };
}

/** "Two answers left on your profile" — the headline the popup opens with. */
export function outstandingLine(n: number): string {
  if (n <= 0) return 'Your profile is complete';
  const word = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n);
  return `${word} answer${n === 1 ? '' : 's'} left on your profile`;
}
