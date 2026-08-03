import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AES-256-GCM envelope encryption for PII / secrets at rest (TOTP secrets, phone).
 * Phase 1 uses a single master key from env; Phase 8 swaps to a managed KMS with
 * per-record data keys (the ciphertext layout {iv|tag|ct} stays the same).
 */
@Injectable()
export class EnvelopeCryptoService {
  private readonly logger = new Logger(EnvelopeCryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const b64 = config.get<string>('PII_MASTER_KEY_BASE64');
    let key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      this.logger.warn('PII_MASTER_KEY_BASE64 missing/invalid; deriving a DEV key. Do not use in prod.');
      key = createHash('sha256').update('rfm-loyalty-dev-key').digest();
    }
    this.key = key;
  }

  // Returns a Uint8Array backed by a real ArrayBuffer (Prisma `Bytes` input type).
  encrypt(plaintext: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const joined = Buffer.concat([iv, tag, ct]);
    const out = new Uint8Array(joined.byteLength);
    out.set(joined);
    return out;
  }

  decrypt(blob: Uint8Array): string {
    const buf = Buffer.from(blob);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  /**
   * Reads a PII blob that may predate encryption.
   *
   * Some rows hold the value in the clear — seeded data, and at least one real
   * customer. Callers were doing `try { decrypt } catch { return null }`, so
   * those rows read as "no phone" and every message to them was silently
   * dropped. This distinguishes the two cases instead: a caller can use the
   * value *and* know the row still needs repairing.
   *
   * A real {iv|tag|ct} blob is at least 29 bytes and is not valid UTF-8, so
   * "decodes cleanly to printable text" is a safe tell for legacy plaintext.
   */
  readMaybeEncrypted(blob: Uint8Array | null | undefined): {
    value: string | null;
    wasPlaintext: boolean;
  } {
    if (!blob || blob.byteLength === 0) return { value: null, wasPlaintext: false };
    try {
      return { value: this.decrypt(blob), wasPlaintext: false };
    } catch {
      const text = Buffer.from(blob).toString('utf8');
      // Printable and round-trips byte-for-byte — i.e. genuinely text, not a
      // blob that happened to survive a lossy decode.
      const plausible =
        /^[\x20-\x7E]+$/.test(text) && Buffer.from(text, 'utf8').equals(Buffer.from(blob));
      if (plausible) {
        this.logger.warn('PII stored unencrypted — value recovered, row needs re-encrypting');
        return { value: text, wasPlaintext: true };
      }
      this.logger.error('PII blob could not be decrypted and is not readable plaintext');
      return { value: null, wasPlaintext: false };
    }
  }
}
