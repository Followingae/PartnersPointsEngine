/**
 * Generates the OpenAPI document to apps/api/openapi.json WITHOUT starting a
 * server. Used by CI to commit + diff the spec (breaking-change gate) and to
 * generate the typed SDKs / frontend clients.
 *
 * Env is set BEFORE the app module is (dynamically) imported, because
 * ConfigModule.forRoot validates env at module-evaluation time.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.SKIP_DB = '1';
process.env.NODE_ENV ??= 'production';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/placeholder';
process.env.JWT_ACCESS_SECRET ??= 'placeholder-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'placeholder-refresh-secret-0123456789';

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { buildOpenApiDocument } = await import('./swagger');

  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const document = buildOpenApiDocument(app);
  const out = join(process.cwd(), 'openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
   
  console.log(`Wrote ${out}`);
}

void main();
