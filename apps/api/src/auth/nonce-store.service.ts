import { Injectable } from '@nestjs/common';

/**
 * Replay-protection store for terminal HMAC nonces. This in-memory implementation
 * is per-instance (fine for single-node dev); in production it is backed by Redis
 * (shared across API replicas) — swap the body for `SET nonce NX EX <skew>`.
 */
@Injectable()
export class NonceStoreService {
  private readonly seen = new Map<string, number>(); // nonce -> expiry (ms)

  /** Records the nonce; returns false if it was already seen (a replay). */
  checkAndRemember(nonce: string, ttlSeconds: number): boolean {
    this.gc();
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, Date.now() + ttlSeconds * 1000);
    return true;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, exp] of this.seen) if (exp < now) this.seen.delete(k);
  }
}
