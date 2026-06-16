import { z } from 'zod';

/** Canonical header names (one source of truth across server + SDKs). */
export const HEADERS = {
  idempotencyKey: 'Idempotency-Key',
  loyaltyVersion: 'Loyalty-Version',
  requestId: 'X-Request-Id',
  /** Terminal HMAC auth scheme lives in Authorization: `Loyalty-HMAC ...`. */
  authorization: 'Authorization',
  rateLimitRemaining: 'RateLimit-Remaining',
  rateLimitReset: 'RateLimit-Reset',
} as const;

/** Current API version segment (path-versioned). */
export const API_VERSION = 'v1' as const;

/** Cursor pagination + filtering convention shared by list endpoints. */
export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
