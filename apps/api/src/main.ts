import 'reflect-metadata';

// Serialize BigInt as a string in all JSON responses (ledger amounts are bigint).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './platform-core/filters/all-exceptions.filter';
import { applyPendingMigrations } from './platform-core/prisma/schema-migrator';
import { buildOpenApiDocument } from './swagger';

async function bootstrap(): Promise<void> {
  // Schema first, before anything can serve a request against a database it
  // doesn't match. A failure here is deliberately fatal: an API answering
  // queries for columns that don't exist corrupts data quietly, where a
  // container that won't start is loud and obvious.
  //
  // The worker runs this same entrypoint and must NOT migrate. It has no
  // DIRECT_URL, so it would attempt DDL through the transaction pooler — and
  // because a failure here stops the boot, that would take down settlement,
  // point expiry and the WhatsApp relay along with it. One migrator, on the
  // service that owns the direct connection.
  const isWorker = process.env.ROLE === 'worker';
  if (!isWorker && process.env.SKIP_DB !== '1' && process.env.SKIP_MIGRATIONS !== '1') {
    const r = await applyPendingMigrations({
      info: (m) => console.log(m),
      error: (m) => console.error(m),
    });
    console.log(`schema: ${r.applied.length} applied, ${r.skipped} already current`);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(PinoLogger));
  app.use(helmet());
  // Lock CORS to the configured console origins in production; reflect any origin
  // when CORS_ORIGINS is unset (local dev).
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true });

  // Path-versioned API; health/readiness/docs live outside the version prefix.
  app.setGlobalPrefix('v1', { exclude: ['health', 'ready', 'metrics', 'docs', 'docs-json'] });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger describes all 211 routes, 69 of them admin and superadmin. Served
  // openly it hands anyone the full map of the control plane, and third-party
  // POS partners are only ever meant to see the terminal gateway — that surface
  // is documented for them separately in docs/pos-integration-api.md.
  //
  // So: mounted unconditionally outside production, and in production only when
  // API_DOCS_ENABLED is deliberately set. Off by default, because the risk of
  // forgetting to turn it off outweighs the convenience of it being on.
  const docsEnabled =
    process.env.NODE_ENV !== 'production' || process.env.API_DOCS_ENABLED === 'true';
  if (docsEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  app
    .get(PinoLogger)
    .log(
      `RFM Loyalty API listening on http://localhost:${port}` +
        (docsEnabled ? ' (docs: /docs)' : ' (docs disabled)'),
    );
}

void bootstrap();
