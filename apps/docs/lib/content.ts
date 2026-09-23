import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { bundledLanguages, codeToHtml } from 'shiki';

/** Repo root, so the OpenAPI export can be read from apps/api at build time. */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return join(process.cwd(), '..', '..');
}

/** The docs app's own content folder. */
export function contentDir(): string {
  const local = join(process.cwd(), 'content');
  if (existsSync(local)) return local;
  return join(repoRoot(), 'apps', 'docs', 'content');
}

export type TocItem = { id: string; text: string; depth: 2 | 3 };

export type Rendered = { html: string; toc: TocItem[] };

export type GuideMeta = { title: string; description: string };

export type Guide = GuideMeta & Rendered & { slug: string };

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

export function slugify(text: string): string {
  return stripTags(text)
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Syntax-highlight a snippet with the portal's light theme. */
export async function highlight(code: string, lang: string): Promise<string> {
  const known = lang && lang in bundledLanguages ? lang : 'text';
  return codeToHtml(code, { lang: known, theme: 'github-light' });
}

/** Markdown → HTML with anchored headings, highlighted code and a table of contents. */
export async function renderMarkdown(md: string): Promise<Rendered> {
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();

  const marked = new Marked({
    async: true,
    gfm: true,
    async walkTokens(token) {
      if (token.type !== 'code') return;
      const t = token as Tokens.Code;
      const lang = (t.lang ?? '').trim().toLowerCase();
      const highlighted = await highlight(t.text, lang);
      Object.assign(token, {
        type: 'html',
        block: true,
        pre: false,
        text: `<div class="code" data-lang="${escapeAttr(lang || 'text')}">${highlighted}</div>\n`,
      });
    },
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        let id = slugify(text);
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ id, text: stripTags(text), depth });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${text}</h${depth}>\n`;
      },
    },
  });

  const rendered = await marked.parse(md);
  const html = rendered.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, toc };
}

/** Minimal front matter: `---\nkey: value\n---` at the top of the file. */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: raw.slice(m[0].length) };
}

export function guideExists(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && existsSync(join(contentDir(), 'guides', `${slug}.md`));
}

export async function loadGuide(slug: string): Promise<Guide | null> {
  if (!guideExists(slug)) return null;
  const raw = readFileSync(join(contentDir(), 'guides', `${slug}.md`), 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const rendered = await renderMarkdown(body);
  return { slug, title: meta.title ?? slug, description: meta.description ?? '', ...rendered };
}
