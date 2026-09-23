import { terminalOpenApi } from '../../lib/openapi';

export const dynamic = 'force-static';

export function GET() {
  const body = JSON.stringify(terminalOpenApi(), null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'inline; filename="partners-points-pos-api.openapi.json"',
      'Cache-Control': 'private, no-store',
    },
  });
}
