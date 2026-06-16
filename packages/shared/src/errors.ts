import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned in the error envelope.
 * Add codes here; never reuse an old code for a new meaning.
 */
export const ErrorCode = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'idempotency_key_reused',
  'rate_limited',
  'insufficient_balance',
  'tenant_context_missing',
  'signature_invalid',
  'clock_skew',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** The single error envelope shape every surface returns. */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export function makeError(
  code: ErrorCode,
  message: string,
  details?: unknown,
  requestId?: string,
): ErrorEnvelope {
  return { error: { code, message, ...(details !== undefined ? { details } : {}), ...(requestId ? { requestId } : {}) } };
}
