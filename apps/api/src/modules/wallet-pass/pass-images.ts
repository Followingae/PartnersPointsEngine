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
