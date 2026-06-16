import { createHash, randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

/**
 * PHASE 1 STUB: in-memory phone-OTP store for the customer auth flow.
 * Replaced in Phase 3/5 by Redis (TTL) + a pluggable SMS/WhatsApp provider and
 * per-phone/per-IP rate limiting. Codes are logged in dev, never sent.
 */
@Injectable()
export class OtpStoreService {
  private readonly logger = new Logger(OtpStoreService.name);
  private readonly store = new Map<string, OtpRecord>();
  private readonly ttlMs = 5 * 60 * 1000;

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Issue a 6-digit code for a phone and (dev only) log it. */
  issue(phone: string): void {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.store.set(phone, { codeHash: this.hash(code), expiresAt: Date.now() + this.ttlMs, attempts: 0 });
    this.logger.warn(`[DEV OTP] ${phone} -> ${code} (replace with SMS/WhatsApp provider)`);
  }

  /** Verify and consume a code. */
  verify(phone: string, code: string): boolean {
    const rec = this.store.get(phone);
    if (!rec || rec.expiresAt < Date.now() || rec.attempts >= 5) {
      return false;
    }
    rec.attempts += 1;
    const ok = rec.codeHash === this.hash(code);
    if (ok) this.store.delete(phone);
    return ok;
  }
}
