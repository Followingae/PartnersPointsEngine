import { inject } from 'vitest';

/** Connection string for tests: env (CI) or the embedded instance (local). */
export function dbUrl(): string {
  return process.env.DATABASE_URL ?? inject('DATABASE_URL');
}
