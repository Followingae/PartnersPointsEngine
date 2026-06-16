import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/** Builds the OpenAPI document with the four per-surface security schemes. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('RFM Loyalty Engine API')
    .setDescription(
      'Multi-tenant, closed-loop, B2B2C loyalty engine. Four surfaces: ' +
        'Superadmin (/v1/admin), Brand Admin (/v1/manage), Customer (/v1/customer), Terminal (/v1/terminal).',
    )
    .setVersion('v1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'customer')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'Authorization' }, 'terminal-hmac')
    .addTag('system')
    .addTag('auth')
    .build();

  return SwaggerModule.createDocument(app, config);
}
