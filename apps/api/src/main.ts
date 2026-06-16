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
import { buildOpenApiDocument } from './swagger';

async function bootstrap(): Promise<void> {
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

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  app.get(PinoLogger).log(`RFM Loyalty API listening on http://localhost:${port} (docs: /docs)`);
}

void bootstrap();
