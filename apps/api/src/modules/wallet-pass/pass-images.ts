import { deflateSync } from 'node:zlib';

/**
 * The images a pass has to carry.
 *
 * Apple rejects a `.pkpass` with no `icon.png`, so this cannot be skipped —
 * and the icon has to exist at build time, which rules out fetching brand
 * artwork over the network while a customer waits on an "Add to Wallet" tap.
 *
 * So the icon is generated: a solid square in the brand's own colour. That is
 * the same degradation the design accepts for Google ("the hex carries the
 * brand and the art system degrades to colour alone"), applied to Apple for
 * the same reason. Uploaded brand logos can replace it later without changing
 * any caller — the shape is already a plain map of filename to bytes.
 */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** A solid-colour RGB PNG of the given size. */
export function solidPng(size: number, hex: string): Buffer {
  const [r, g, b] = hexToRgb(hex);

  // Raw scanlines: each row is a filter byte (0 = None) followed by RGB pixels.
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The image set for a pass, at the sizes Apple expects.
 *
 * icon is mandatory and drives notifications; logo sits on the front. Both are
 * shipped at 1x and 2x because Apple picks per device and a missing @2x renders
 * visibly soft on every phone sold in the last decade.
 */
export function passImages(color: string): Record<string, Buffer> {
  return {
    'icon.png': solidPng(29, color),
    'icon@2x.png': solidPng(58, color),
    'logo.png': solidPng(50, color),
    'logo@2x.png': solidPng(100, color),
  };
}

/** Digits grouped without going through Number, which rounds past 2^53. */
function grouped(balance: string): string {
  return balance.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "3 more coffees" against "1 more wash" — the design calls out both. */
function plural(noun: string, n: number): string {
  if (n === 1) return noun;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * Every image a pass carries, including the strip that holds the design.
 *
 * Which strip depends on what the brand is running, which is what makes the
 * two pass types in the design distinct without any branching in the caller:
 * no stamp card gives screen 70's flat brand block with the balance in it, a
 * running one gives 71 and 72's headline over the icon grid.
 */
export async function imagesFor(d: {
  color: string;
  balance: string;
  pointsCode: string;
  stamps: { collected: number; target: number; rewardName: string | null } | null;
  stampIcon: string;
}): Promise<Record<string, Buffer>> {
  const base = passImages(d.color);
  const { pointsStrip, stampStrip } = await import('./stamp-strip');

  if (!d.stamps) {
    return {
      ...base,
      ...(await pointsStrip({
        balance: grouped(d.balance),
        pointsCode: d.pointsCode,
        color: d.color,
      })),
    };
  }

  const { headline, subhead } = stampCopy(d.stamps);

  return {
    ...base,
    ...(await stampStrip({
      collected: d.stamps.collected,
      target: d.stamps.target,
      icon: d.stampIcon,
      color: d.color,
      headline,
      subhead,
    })),
  };
}

/**
 * Whether a reward name can be counted in a sentence.
 *
 * "coffee" and "wash" can — "3 more coffees" reads. "AED 50 Voucher" and
 * "20% off" cannot, and the naive version produced "1 more AED 50 Voucher".
 * One short word, no digits or symbols, is the test that separates them.
 */
function countsAsNoun(reward: string): boolean {
  return /^[a-z]+$/i.test(reward) && reward.length <= 12;
}

/**
 * The two lines on a stamp strip.
 *
 * Exported so it can be tested directly: the copy now lives inside a PNG, and
 * asserting on rendered pixels would test the rasteriser rather than the words.
 *
 * What is counted is stamps, not rewards. The design's "3 more coffees" works
 * because that brand's reward *is* a coffee — apply the same rule to an "AED 50
 * Voucher" and you get "1 more AED 50 Voucher", which is what shipped.
 */
export function stampCopy(stamps: {
  collected: number;
  target: number;
  rewardName: string | null;
}): { headline: string; subhead: string } {
  const left = stamps.target - stamps.collected;
  const reward = stamps.rewardName?.trim();
  const countable = reward && countsAsNoun(reward) ? reward : null;

  if (left <= 0) {
    return {
      headline: reward ? `${reward} ready` : 'Reward ready',
      subhead: 'Show this at the counter',
    };
  }
  return {
    headline: `${left} more ${plural(countable ?? 'stamp', left)}`,
    subhead: reward ? `for a free ${reward}` : 'until your next reward',
  };
}
