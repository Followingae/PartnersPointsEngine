import sharp from 'sharp';
import { fit, textPath, textWidth } from './strip-text';

/**
 * The strip image — where the design actually lives.
 *
 * `pass.json` has fixed field slots, the system font, and no layout control, so
 * the screens in the design cannot be expressed in it. What a pass does have is
 * a full-width image behind the primary fields. Every good-looking pass — the
 * airline ones people point at — puts its typography and artwork there and
 * keeps the fields minimal. This does the same.
 *
 * Two strips, matching the design's two pass types:
 *   · points — the brand hex, flat, with the balance set in it (screen 70)
 *   · stamps — the remaining count over the grid of icons (screens 71, 72)
 */

/** Apple's storeCard strip, in points. Rendered at 3x for retina. */
const W = 375;
const H = 123;
const PAD = 24;

/**
 * Industry glyphs, drawn inside a 24×24 box.
 *
 * Path data rather than imported files: a missing asset would produce a pass
 * with holes in it, and the customer would see that long before we did.
 */
export const STAMP_ICONS: Record<string, string> = {
  coffee:
    'M6 9h9v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V9Z M15 10h2a2 2 0 0 1 0 4h-2 M8 5c0 1 1 1 1 2 M11 4c0 1 1 1 1 2',
  car:
    'M4 15h16v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3Z M5 15l1.5-4a2 2 0 0 1 2-1.4h7a2 2 0 0 1 2 1.4L19 15',
  meal: 'M8 4v7a2 2 0 0 0 2 2v7 M8 4v4 M11 4v4 M16 4c-1.5 0-2 2-2 4s.5 3 2 3v9',
  retail: 'M6 8h12l-1 12H7L6 8Z M9 8V6a3 3 0 0 1 6 0v2',
  salon:
    'M6 5l9 12 M18 5L9 17 M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  fitness: 'M4 10v4 M7 8v8 M17 8v8 M20 10v4 M7 12h10',
  grocery: 'M5 7h14l-1.5 9h-11L5 7Z M5 7L4 4H2 M8 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M16 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  pharmacy: 'M12 6v12 M6 12h12',
  star: 'M12 4l2.3 5.2 5.7.5-4.3 3.8 1.3 5.5L12 16.2 7 19l1.3-5.5L4 9.7l5.7-.5L12 4Z',
};

export type StampIcon = keyof typeof STAMP_ICONS | string;

const glyph = (n: StampIcon) => STAMP_ICONS[n] ?? STAMP_ICONS.star!;

/** Readable ink for a given fill — the same rule the app's cards use. */
function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  // Perceived luminance; a mid-grey brand should get dark ink, not white.
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 150 ? '#15150F' : '#FFFFFF';
}

async function rasterise(svg: string) {
  const at = (scale: number) =>
    sharp(Buffer.from(svg), { density: 72 * scale })
      .resize(W * scale, H * scale, { fit: 'fill' })
      .png()
      .toBuffer();
  const [x1, x2, x3] = await Promise.all([at(1), at(2), at(3)]);
  return { 'strip.png': x1, 'strip@2x.png': x2, 'strip@3x.png': x3 };
}

/**
 * Screen 70 — the brand hex, flat, with the balance set in it.
 *
 * The balance is the one thing someone opens this card to see, so it is set
 * large and left-aligned on the brand colour, with the points code trailing it
 * at label size.
 */
export async function pointsStrip(opts: {
  balance: string;
  pointsCode: string;
  color: string;
}): Promise<Record<string, Buffer>> {
  const ink = inkOn(opts.color);
  const size = 38;
  const balance = fit(opts.balance, W - PAD * 2 - 60, size, 700);
  const w = textWidth(balance, size, 700);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${opts.color}"/>` +
    textPath({ text: balance, x: PAD, baseline: H / 2 + 13, size, weight: 700, fill: ink }) +
    // Trails the figure on the same baseline, quieter, as on the design.
    textPath({
      text: opts.pointsCode, x: PAD + w + 8, baseline: H / 2 + 13,
      size: 12, weight: 700, fill: ink, opacity: 0.7, tracking: 0.6,
    }) +
    `</svg>`;

  return rasterise(svg);
}

/**
 * How stamps are arranged.
 *
 * The design puts five on one row and nine on three. Three rows do not fit 123
 * points once the headline is above them, so beyond six this wraps to two — the
 * count stays honest, which matters more than matching the mock at every target.
 */
function layout(target: number): { rows: number; perRow: number } {
  if (target <= 6) return { rows: 1, perRow: target };
  return { rows: 2, perRow: Math.ceil(target / 2) };
}

/**
 * Screens 71 and 72 — "3 more coffees / for a free coffee" over the grid.
 *
 * `collected` is capped at `target` because stamp cards roll over: someone on
 * their second card sits at 11 of 9, and drawing eleven icons would be wrong in
 * a way nobody could interpret.
 */
export async function stampStrip(opts: {
  collected: number;
  target: number;
  icon: StampIcon;
  color: string;
  headline: string;
  subhead: string;
}): Promise<Record<string, Buffer>> {
  const target = Math.max(1, Math.min(opts.target, 12));
  const collected = Math.max(0, Math.min(opts.collected, target));
  const { rows, perRow } = layout(target);

  const INK = '#15150F';
  const SHEET = '#FFFFFF';

  // Headline block first; the grid takes whatever is left.
  const headSize = 21;
  const headline = fit(opts.headline, W - PAD * 2, headSize, 700);
  const subhead = fit(opts.subhead, W - PAD * 2, headSize, 500);
  const headTop = 14;
  const lineGap = headSize + 6;

  const gridTop = headTop + lineGap * 2 + 8;
  const gridH = H - gridTop - 8;
  const cell = Math.min(40, Math.floor((W - PAD * 2) / perRow), Math.floor(gridH / rows));
  const r = Math.floor(cell * 0.44);
  const iconScale = (r * 1.15) / 24;

  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${SHEET}"/>`];

  parts.push(
    textPath({ text: headline, x: PAD, baseline: headTop + headSize, size: headSize, weight: 700, fill: INK }),
  );
  parts.push(
    textPath({
      text: subhead, x: PAD, baseline: headTop + lineGap + headSize,
      size: headSize, weight: 500, fill: INK, opacity: 0.45,
    }),
  );

  for (let i = 0; i < target; i += 1) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, target - row * perRow);
    // Rows are centred independently so a short final row does not hang left.
    const x = Math.floor((W - inRow * cell) / 2 + col * cell + cell / 2);
    const y = Math.floor(gridTop + row * cell + cell / 2);
    const done = i < collected;
    const g = `translate(${x - 12 * iconScale},${y - 12 * iconScale}) scale(${iconScale.toFixed(3)})`;

    // Filled is a solid disc with the glyph knocked out in the sheet colour;
    // empty is a dashed ring with a faint glyph, so the remaining count reads
    // at a glance rather than needing to be counted.
    parts.push(
      done
        ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${opts.color}"/>` +
            `<g transform="${g}" fill="none" stroke="${SHEET}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph(opts.icon)}"/></g>`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${opts.color}" stroke-opacity="0.32" stroke-width="1.4" stroke-dasharray="3 3"/>` +
            `<g transform="${g}" fill="none" stroke="${opts.color}" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph(opts.icon)}"/></g>`,
    );
  }

  return rasterise(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`,
  );
}
