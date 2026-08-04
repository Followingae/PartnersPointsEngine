/**
 * The CSV writer.
 *
 * A corrupt CSV still opens, which is what makes this worth testing: nobody
 * gets an error, the columns are just quietly wrong from the first comma
 * onwards. These are the cases that were broken before it existed.
 */
import { describe, expect, it } from 'vitest';
import { day, money, toCsv, when } from '../src/platform-core/csv';

const rows = (csv: string) => csv.replace(/^\uFEFF/, '').trim().split('\r\n');

describe('csv', () => {
  it('quotes values containing a comma, so columns cannot shift', () => {
    const out = toCsv([{ name: 'Coffee, any size', cost: 120 }], [
      { header: 'Reward', value: (r) => r.name },
      { header: 'Points', value: (r) => r.cost },
    ]);
    expect(rows(out)[1]).toBe('"Coffee, any size",120');
  });

  it('doubles embedded quotes rather than breaking out of the field', () => {
    const out = toCsv([{ n: 'The "Usual"' }], [{ header: 'Name', value: (r) => r.n }]);
    expect(rows(out)[1]).toBe('"The ""Usual"""');
  });

  it('keeps a newline inside one cell', () => {
    const out = toCsv([{ n: 'line one\nline two' }], [{ header: 'Note', value: (r) => r.n }]);
    // One record, even though it spans two physical lines.
    expect(out.replace(/^\uFEFF/, '').trim()).toBe('Note\r\n"line one\nline two"');
  });

  it('starts with a UTF-8 BOM, or Excel renders Arabic as mojibake', () => {
    const out = toCsv([{ n: 'محمد' }], [{ header: 'Name', value: (r) => r.n }]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain('محمد');
  });

  it('defuses values Excel would run as a formula', () => {
    // A name beginning "=" is a spreadsheet injection, not a name.
    const out = toCsv([{ n: '=1+1' }, { n: '+971501234567' }], [{ header: 'Value', value: (r) => r.n }]);
    expect(rows(out)[1]).toBe("'=1+1");
    expect(rows(out)[2]).toBe("'+971501234567");
  });

  it('writes empty cells for null and undefined, not the word', () => {
    const out = toCsv([{ a: null, b: undefined }], [
      { header: 'A', value: (r) => r.a },
      { header: 'B', value: (r) => r.b },
    ]);
    expect(rows(out)[1]).toBe(',');
  });

  it('formats money from minor units and dates without a zone marker', () => {
    expect(money(12345)).toBe('123.45');
    expect(money(0)).toBe('0.00');
    expect(money(null)).toBe('');
    expect(when('2026-08-04T14:32:07.000Z')).toBe('2026-08-04 14:32');
    expect(day('2026-08-04T14:32:07.000Z')).toBe('2026-08-04');
    expect(when(null)).toBe('');
    expect(when('not a date')).toBe('');
  });
});
