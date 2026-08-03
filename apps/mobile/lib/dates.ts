/**
 * Human dates for the customer app.
 *
 * The API sends ISO timestamps; screens never show one. Formatting is done by
 * hand rather than through Intl so a device with a trimmed ICU still renders
 * "12 Jul" and not a locale fallback — the design only ever asks for three
 * shapes: a day label, a clock time, and the two joined.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Written out in full, for the birthday picker. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many days a month has, leap years included. `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "12 Jul", carrying the year only when it isn't the current one. */
export function shortDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "Today" · "Yesterday" · "12 Jul" — the Activity feed's group headings. */
export function dayLabel(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return 'Earlier';
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return shortDate(iso);
}

/** "2:41 PM". */
export function timeLabel(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${m < 10 ? `0${m}` : m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today · 2:41 PM" — the receipt line on a detail screen. */
export function dateTimeLabel(iso: string | null | undefined): string {
  return [dayLabel(iso), timeLabel(iso)].filter(Boolean).join(' · ');
}
