/**
 * CSV that opens correctly in the thing people actually open it in.
 *
 * Every export in this codebase was built with `[...].join(',')`, which is fine
 * until a value contains a comma — a reward called "Coffee, any size", a
 * customer called "Smith, J" — and then the columns shift and nobody notices,
 * because a corrupt CSV still opens.
 *
 * Three things this fixes:
 *
 * · Escaping, per RFC 4180. Commas, quotes and newlines survive.
 * · A UTF-8 byte-order mark. Excel on Windows assumes the local codepage
 *   without it, so Arabic names — in a UAE product — arrive as mojibake. One
 *   invisible character is the whole difference.
 * · Formatting. Minor units become money, ISO timestamps become dates someone
 *   can read, and nulls become empty cells rather than the word "null".
 */

/** Excel needs this to recognise UTF-8. Everything else ignores it. */
const BOM = '\uFEFF';

/**
 * One cell.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel treat the value as a formula —
 * which is how a customer name becomes a spreadsheet injection. Prefixing with
 * an apostrophe is the standard defence and is invisible in the cell.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface Column<T> {
  /** The header, written for a person: "Loyalty ID", not "loyaltyId". */
  header: string;
  value: (row: T) => unknown;
}

/** Builds the whole file: BOM, header row, then the rows. CRLF, as Excel expects. */
export function toCsv<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return BOM + [head, ...body].join('\r\n') + '\r\n';
}

/** Minor units to a plain decimal — 12345 → "123.45". No symbol; the header says the currency. */
export function money(minor: bigint | number | string | null | undefined): string {
  if (minor === null || minor === undefined || minor === '') return '';
  const n = typeof minor === 'bigint' ? Number(minor) : Number(minor);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '';
}

/**
 * A timestamp someone can read and a spreadsheet can sort: "2026-08-04 14:32".
 *
 * Deliberately not ISO with the `Z` — it sorts identically, and the trailing
 * zone marker is noise to everyone who opens these.
 */
export function when(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Just the day, for columns where the time is noise. */
export function day(v: Date | string | null | undefined): string {
  return when(v).slice(0, 10);
}
