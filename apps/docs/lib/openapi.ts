import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './content';

/**
 * The partner-facing OpenAPI document: the terminal surface only, cut from the
 * full spec the API exports (`apps/api/openapi.json`). Admin, brand and
 * customer surfaces never leave the building; the first-party terminal app's
 * update endpoint is left out because a partner POS has no use for it.
 */
const EXCLUDED_PATHS = new Set(['/terminal/app-version']);

type Json = Record<string, unknown>;

export function terminalOpenApi(): Json {
  const spec = JSON.parse(readFileSync(join(repoRoot(), 'apps', 'api', 'openapi.json'), 'utf8')) as Json;
  const allPaths = spec.paths as Record<string, Json>;
  const allSchemas = ((spec.components as Json | undefined)?.schemas ?? {}) as Record<string, Json>;

  const paths: Record<string, Json> = {};
  for (const [path, item] of Object.entries(allPaths)) {
    if (!path.startsWith('/terminal/') || EXCLUDED_PATHS.has(path)) continue;
    const cleaned: Json = {};
    for (const [method, op] of Object.entries(item)) {
      const o = { ...(op as Json) };
      if (typeof o.operationId === 'string') o.operationId = o.operationId.replace(/^TerminalController_/, '');
      cleaned[method] = o;
    }
    paths[path] = cleaned;
  }

  // Pull in every schema the kept operations reach, transitively.
  const needed = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, value] of Object.entries(node as Json)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/schemas/')) {
        const name = value.slice('#/components/schemas/'.length);
        if (!needed.has(name)) {
          needed.add(name);
          visit(allSchemas[name]);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(paths);
  const schemas = Object.fromEntries([...needed].sort().map((n) => [n, allSchemas[n]]));

  return {
    openapi: spec.openapi,
    info: {
      title: 'Partners Points — POS Integration API',
      version: 'v1',
      description:
        'Terminal gateway for third-party point-of-sale systems: identify a member, quote and award points, ' +
        'redeem rewards, and reconcile after an outage. Every request is signed with HMAC-SHA256; see the ' +
        'reference for the canonical string and worked examples.',
      contact: { name: 'Partners Points integration support', email: 'help@partnerspoints.ae' },
    },
    servers: [{ url: 'https://api.partnerspoints.ae/v1', description: 'Production' }],
    tags: [{ name: 'terminal', description: 'Point-of-sale integration surface' }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        'terminal-hmac': {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description:
            'Loyalty-HMAC publishableKeyId=<id>,ts=<unix-seconds>,nonce=<unique>,sig=<hex>. ' +
            'sig = HMAC-SHA256(secret, METHOD\\nPATH\\nTS\\nNONCE\\nSHA256(body)). PATH includes /v1 and excludes the query string.',
        },
      },
    },
    security: [{ 'terminal-hmac': [] }],
  };
}
