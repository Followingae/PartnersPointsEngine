/**
 * What a customer has and hasn't told us.
 *
 * Used to say so plainly on the profile screen rather than to score anyone —
 * there is no reward for a filled-in profile, and inventing one here would
 * promise something the server does not do.
 */
import type { Profile } from '@/lib/api';
import { countryName } from '@/lib/countries';

const DETAILS: { key: keyof Profile; label: string }[] = [
  { key: 'fullName', label: 'name' },
  { key: 'birthdate', label: 'birthday' },
  { key: 'gender', label: 'gender' },
  { key: 'nationality', label: 'nationality' },
];

/** The details still to add, in the order the edit screen asks for them. */
export function missingDetails(p: Profile | undefined): string[] {
  if (!p) return [];
  return DETAILS.filter((d) => !p[d.key]).map((d) => d.label);
}

/** "and" joins the last two: "birthday and nationality". */
function sentence(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The subtitle under "Personal details": what is still missing, or — once
 * nothing is — the nationality on file, which is otherwise unseen outside the
 * edit screen.
 */
export function detailsSummary(p: Profile | undefined): string {
  if (!p) return 'Name, birthday, nationality';
  const missing = missingDetails(p);
  if (missing.length === 0) return countryName(p.nationality) ?? 'All set';
  return `Still to add: ${sentence(missing)}`;
}
