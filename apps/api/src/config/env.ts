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

  // PII envelope key — validated here so a prod instance can never boot without
  // it and silently fall back to a derived (effectively public) key.
  PII_MASTER_KEY_BASE64: z.string().optional(),
  // Comma-separated allowed browser origins for the consoles.
  CORS_ORIGINS: z.string().optional(),

  DEFAULT_REGION: z.string().default('uae'),
  DEFAULT_CURRENCY: z.string().default('AED'),
})
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Production guard rails: the deploy cannot come up in a state the audit
    // found dangerous (owner DB role, missing PII key, reflect-any CORS, dev
    // JWT secrets).
    const require = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: why });
    };
    require('APP_DATABASE_URL', 'required in production: the non-owner, RLS-enforced role');
    require('CORS_ORIGINS', 'required in production: explicit allowed console origins');
    const key = env.PII_MASTER_KEY_BASE64 ? Buffer.from(env.PII_MASTER_KEY_BASE64, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PII_MASTER_KEY_BASE64'], message: 'required in production: a 32-byte base64 key' });
    }
    for (const s of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (/change-me|dev-|ci-/i.test(env[s])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [s], message: 'must not be a development/placeholder secret in production' });
      }
    }
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
