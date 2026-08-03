import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { PrismaService } from '../../platform-core/prisma/prisma.service';

/**
 * Encrypts PII that was stored in the clear.
 *
 * Seeded rows — and at least one real customer — held phone numbers as plain
 * text in a column that is supposed to be envelope-encrypted. Every read of
 * those rows threw inside a `catch` that returned null, so they looked like
 * customers with no phone number and their messages were dropped without a
 * trace. Two faults: PII unprotected at rest, and a silent failure hiding it.
 *
 * Runs once at startup. It is idempotent — an already-encrypted row fails the
 * plaintext test and is left alone — so running on every instance and every
 * deploy is harmless.
 */
@Injectable()
export class PiiBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PiiBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EnvelopeCryptoService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.SKIP_DB === '1' || process.env.NODE_ENV === 'test') return;
    try {
      const r = await this.run();
      if (r.repaired || r.failed) {
        this.logger.warn(
          `PII backfill: ${r.repaired} re-encrypted, ${r.failed} failed, ${r.checked} checked`,
        );
      }
      if (r.failed) {
        // Say so plainly — a partial sweep leaving PII in the clear is exactly
        // the kind of thing that goes unnoticed until it matters.
        this.logger.error(`${r.failed} row(s) still hold unencrypted PII — see errors above`);
      }
    } catch (e) {
      // Never block startup for this — the app is still serviceable.
      this.logger.error(`PII backfill aborted: ${(e as Error).message}`);
    }
  }

  async run(): Promise<{ checked: number; repaired: number; failed: number; skipped: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; phone_enc: Buffer | null; email_enc: Buffer | null }>
    >`SELECT id, phone_enc, email_enc FROM pii_encryption_candidates()`;

    let repaired = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      // One bad row must never abort the sweep — that is precisely what left
      // six of seven rows unencrypted the first time this ran.
      try {
        const phone = this.crypto.readMaybeEncrypted(row.phone_enc);
        const email = this.crypto.readMaybeEncrypted(row.email_enc);
        if (!phone.wasPlaintext && !email.wasPlaintext) {
          skipped++;
          continue;
        }

        // Null leaves the column alone, so only what was plaintext is rewritten.
        const nextPhone = phone.wasPlaintext && phone.value
          ? Buffer.from(this.crypto.encrypt(phone.value))
          : null;
        const nextEmail = email.wasPlaintext && email.value
          ? Buffer.from(this.crypto.encrypt(email.value))
          : null;

        const [res] = await this.prisma.$queryRaw<Array<{ pii_set_encrypted: boolean }>>`
          SELECT pii_set_encrypted(${row.id}, ${nextPhone}, ${nextEmail}) AS pii_set_encrypted`;
        if (!res?.pii_set_encrypted) {
          failed++;
          this.logger.error(`person ${row.id}: update matched no row`);
          continue;
        }

        if (await this.verify(row.id, phone.value, email.value)) {
          repaired++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
        this.logger.error(`person ${row.id}: ${(e as Error).message}`);
      }
    }
    return { checked: rows.length, repaired, failed, skipped };
  }

  /**
   * Reads the row back and confirms it now decrypts to what it held before.
   *
   * Worth the extra query: writing ciphertext that doesn't decrypt, or that
   * decrypts to something else, would lose a customer's phone number
   * irrecoverably. Better to know immediately than to discover it when a
   * message fails to send.
   */
  private async verify(
    personId: string,
    expectedPhone: string | null,
    expectedEmail: string | null,
  ): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ id: string; phone_enc: Buffer | null; email_enc: Buffer | null }>
    >`SELECT id, phone_enc, email_enc FROM pii_encryption_candidates() WHERE id = ${personId}`;
    if (!row) return false;

    const phone = this.crypto.readMaybeEncrypted(row.phone_enc);
    const email = this.crypto.readMaybeEncrypted(row.email_enc);

    const phoneOk = expectedPhone === null || (!phone.wasPlaintext && phone.value === expectedPhone);
    const emailOk = expectedEmail === null || (!email.wasPlaintext && email.value === expectedEmail);
    if (!phoneOk || !emailOk) {
      this.logger.error(`person ${personId}: re-encrypted value did not verify`);
      return false;
    }
    return true;
  }
}
