import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { bundledLanguages, codeToHtml } from 'shiki';

/**
 * The portal renders the partner documentation straight from the repo's
 * `docs/pos-integration-api.md`, so there is exactly one source of truth and
 * publishing is a deploy, not a copy-paste.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return join(process.cwd(), '..', '..');
}

export type TocItem = { id: string; text: string; depth: 2 | 3 };

export type Reference = {
  title: string;
  version: string;
  html: string;
  toc: TocItem[];
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

function slugify(text: string): string {
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

export async function loadReference(): Promise<Reference> {
  const md = readFileSync(join(repoRoot(), 'docs', 'pos-integration-api.md'), 'utf8');

  const title = /^# (.+)$/m.exec(md)?.[1]?.trim() ?? 'POS Integration API';
  const version = /^\*\*(Version[^*]+)\*\*/m.exec(md)?.[1]?.trim() ?? 'Version 1';

  const toc: TocItem[] = [];
  const seen = new Map<string, number>();

  const marked = new Marked({
    async: true,
    gfm: true,
    async walkTokens(token) {
      if (token.type !== 'code') return;
      const t = token as Tokens.Code;
      const lang = (t.lang ?? '').trim().toLowerCase();
      const known = lang && lang in bundledLanguages ? lang : 'text';
      const highlighted = await codeToHtml(t.text, { lang: known, theme: 'github-light' });
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
  // Tables need a scroll container on narrow screens; marked has no hook for it.
  const html = rendered.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');

  return { title, version, html, toc };
}
