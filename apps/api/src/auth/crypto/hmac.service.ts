import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Terminal request signing (SigV4-style). Phase 1 implements the canonicalization
 * and constant-time verification; secure storage/retrieval of the per-terminal
 * shared secret is completed in Phase 4 (terminal gateway).
 */
@Injectable()
export class HmacService {
  /** Build the canonical string-to-sign from request parts. */
  canonical(method: string, path: string, ts: string, nonce: string, rawBody: string): string {
    const bodyHash = createHash('sha256').update(rawBody ?? '').digest('hex');
    return [method.toUpperCase(), path, ts, nonce, bodyHash].join('\n');
  }

  sign(secret: string, canonical: string): string {
    return createHmac('sha256', secret).update(canonical).digest('hex');
  }

  verify(secret: string, canonical: string, signatureHex: string): boolean {
    const expected = this.sign(secret, canonical);
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(signatureHex, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** True if `ts` (unix seconds) is within +/- skewSeconds of now. */
  withinSkew(ts: number, nowSeconds: number, skewSeconds: number): boolean {
    return Math.abs(nowSeconds - ts) <= skewSeconds;
  }
}
