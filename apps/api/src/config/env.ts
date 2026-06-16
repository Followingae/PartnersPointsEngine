import { z } from 'zod';

/** Validated environment. Fails fast at boot if misconfigured. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  LOG_LEVEL: z.string().default('info'),

  // Database — runtime uses APP_DATABASE_URL (the enforced `loyalty_app` role)
  // when present, falling back to DATABASE_URL for local dev.
  DATABASE_URL: z.string().min(1),
  APP_DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  // Auth (in-house)
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  TOTP_ISSUER: z.string().default('RFM Loyalty'),
  TERMINAL_HMAC_SKEW_SECONDS: z.coerce.number().int().positive().default(300),

  DEFAULT_REGION: z.string().default('uae'),
  DEFAULT_CURRENCY: z.string().default('AED'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
