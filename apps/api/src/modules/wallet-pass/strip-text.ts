import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

/**
 * Text for the strip image, converted to outlines.
 *
 * A pass cannot carry a font — `pass.json` fields are drawn by iOS in the
 * system face, with no control over any of it. The only way our typography
 * reaches a pass is by rendering it ourselves into the strip image, which is
 * how every good-looking pass does it.
 *
 * Converted to paths rather than left as SVG `<text>`: rasterising text needs a
 * font installed in the container, and a missing one renders *blank* rather
 * than erroring — every customer would get an empty strip and nothing would
 * report it. Outlines carry no such dependency.
 */

const FONT_DIR = join(__dirname, '..', '..', '..', 'assets', 'fonts');

/** Parsed once. Each face is ~95KB and parsing it per pass is pure waste. */
const cache = new Map<string, opentype.Font>();

function face(weight: 500 | 700): opentype.Font {
  const file = weight === 700 ? 'PlusJakartaSans_700Bold.ttf' : 'PlusJakartaSans_500Medium.ttf';
  let f = cache.get(file);
  if (!f) {
    const buf = readFileSync(join(FONT_DIR, file));
    // opentype wants an ArrayBuffer over exactly these bytes; passing the
    // Node Buffer's underlying buffer hands it the whole pool.
    f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    cache.set(file, f);
  }
  return f;
}

export function textWidth(text: string, size: number, weight: 500 | 700): number {
  return face(weight).getAdvanceWidth(text, size);
}

/**
 * One line of text as an SVG `<path>`, positioned by its baseline.
 *
 * Letter-spacing is applied by walking the glyphs rather than through an SVG
 * attribute, which `getPath` ignores.
 */
export function textPath(opts: {
  text: string;
  x: number;
  baseline: number;
  size: number;
  weight: 500 | 700;
  fill: string;
  opacity?: number;
  tracking?: number;
}): string {
  const f = face(opts.weight);
  const tracking = opts.tracking ?? 0;

  let d = '';
  if (tracking === 0) {
    d = f.getPath(opts.text, opts.x, opts.baseline, opts.size).toPathData(2);
  } else {
    let cursor = opts.x;
    for (const ch of opts.text) {
      d += f.getPath(ch, cursor, opts.baseline, opts.size).toPathData(2);
      cursor += f.getAdvanceWidth(ch, opts.size) + tracking;
    }
  }

  const op = opts.opacity !== undefined ? ` fill-opacity="${opts.opacity}"` : '';
  return `<path d="${d}" fill="${opts.fill}"${op}/>`;
}

/** Truncates to fit, because a brand name is user input and the strip is fixed. */
export function fit(text: string, maxWidth: number, size: number, weight: 500 | 700): string {
  if (textWidth(text, size, weight) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size, weight) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}
