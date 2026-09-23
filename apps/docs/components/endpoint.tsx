import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ApiError, Endpoint, Field } from '../content/endpoints';
import { highlight } from '../lib/content';

const BASE = 'https://api.partnerspoints.ae/v1';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline markdown subset for field descriptions: `code` and **bold**. */
export function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function MethodBadge({ method, size = 'md' }: { method: 'GET' | 'POST'; size?: 'sm' | 'md' }) {
  const color = method === 'GET' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand';
  const dims = size === 'sm' ? 'px-1.5 py-[1px] text-[0.62rem]' : 'px-2.5 py-1 text-[0.72rem]';
  return <span className={`inline-flex items-center rounded-md font-mono font-semibold tracking-wide ${color} ${dims}`}>{method}</span>;
}

function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full border-collapse text-[0.9rem]">
        <tbody>
          {fields.map((f, i) => (
            <tr key={f.name} className={i ? 'border-t border-border' : ''}>
              <td className="w-[38%] px-4 py-3 align-top">
                <code className="font-mono text-[0.82rem] text-ink">{f.name}</code>
                {f.required ? <span className="ml-2 text-[0.68rem] font-semibold uppercase tracking-wider text-coral">required</span> : null}
                <div className="mt-1 font-mono text-[0.72rem] text-ink/50">{f.type}</div>
              </td>
              <td className="px-4 py-3 align-top leading-relaxed text-ink/75" dangerouslySetInnerHTML={{ __html: inline(f.description) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({ errors }: { errors: ApiError[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full border-collapse text-[0.9rem]">
        <tbody>
          {errors.map((e, i) => (
            <tr key={i} className={i ? 'border-t border-border' : ''}>
              <td className="w-[38%] px-4 py-3 align-top">
                <span className="font-mono text-[0.82rem] font-semibold text-ink">{e.status}</span>
                <span className="ml-2 font-mono text-[0.78rem] text-ink/55">{e.code}</span>
              </td>
              <td className="px-4 py-3 align-top leading-relaxed text-ink/75" dangerouslySetInnerHTML={{ __html: inline(e.when) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 font-display text-[1.15rem] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

async function CodePanel({ title, code, lang }: { title: string; code: string; lang: string }) {
  const html = await highlight(code, lang);
  return (
    <div className="code-panel">
      <div className="code-panel-head">{title}</div>
      <div className="code-panel-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export async function EndpointPage({ endpoint: e }: { endpoint: Endpoint }) {
  const requestSnippet = [
    `${e.method} ${BASE}${e.path}`,
    'Authorization: Loyalty-HMAC publishableKeyId=pk_…,ts=1758627600,nonce=…,sig=…',
    ...(e.requestExample ? ['Content-Type: application/json', '', JSON.stringify(e.requestExample, null, 2)] : []),
  ].join('\n');
  const responseSnippet = JSON.stringify(e.responseExample, null, 2);

  return (
    <div className="py-10 lg:pl-12 lg:py-12">
      <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-brand">{e.group}</p>
      <h1 className="font-display text-[2.1rem] font-bold leading-[1.15] tracking-tight text-ink">{e.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <MethodBadge method={e.method} />
        <code className="font-mono text-[0.95rem] text-ink">{e.path}</code>
      </div>
      <p className="mt-5 max-w-[720px] text-[1.05rem] leading-relaxed text-ink/60">{e.summary}</p>

      <div className="mt-10 grid gap-12 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 max-w-[720px]">
          <div className="doc">
            {e.description.map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: inline(p) }} />
            ))}
          </div>

          {e.notes?.map((n, i) => (
            <div key={i} className="mt-5 rounded-xl border border-brand-100 border-l-4 border-l-brand bg-brand-50/50 px-4 py-3 text-[0.92rem] leading-relaxed text-ink/80">
              <span dangerouslySetInnerHTML={{ __html: inline(n) }} />
            </div>
          ))}

          {e.pathParams ? (
            <Section title="Path parameters">
              <FieldTable fields={e.pathParams} />
            </Section>
          ) : null}
          {e.query ? (
            <Section title="Query parameters">
              <FieldTable fields={e.query} />
            </Section>
          ) : null}
          {e.request ? (
            <Section title="Request body">
              <FieldTable fields={e.request} />
            </Section>
          ) : (
            <Section title="Request body">
              <p className="text-[0.92rem] text-ink/60">None.</p>
            </Section>
          )}

          <Section title="Response">
            {e.responseNote ? <p className="mb-4 text-[0.92rem] leading-relaxed text-ink/70" dangerouslySetInnerHTML={{ __html: inline(e.responseNote) }} /> : null}
            <FieldTable fields={e.response} />
          </Section>

          <Section title="Errors">
            <ErrorTable errors={e.errors} />
            <p className="mt-3 text-[0.85rem] text-ink/55">
              Every error uses the shared envelope described under{' '}
              <Link href="/errors" className="font-medium text-brand">
                Errors
              </Link>
              .
            </p>
          </Section>
        </div>

        <div className="min-w-0">
          <div className="space-y-5 xl:sticky xl:top-20">
            <CodePanel title="Request" code={requestSnippet} lang="http" />
            <CodePanel title={`Response · ${e.method === 'GET' ? '200' : '201'}`} code={responseSnippet} lang="json" />
          </div>
        </div>
      </div>
    </div>
  );
}
