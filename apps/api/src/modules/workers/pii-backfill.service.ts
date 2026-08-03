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
      const { repaired, checked } = await this.run();
      if (repaired > 0) {
        this.logger.warn(`re-encrypted PII on ${repaired} of ${checked} rows that were stored in the clear`);
      }
    } catch (e) {
      // Never block startup for this — the app is still serviceable.
      this.logger.error(`PII backfill failed: ${(e as Error).message}`);
    }
  }

  async run(): Promise<{ checked: number; repaired: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; phone_enc: Buffer | null; email_enc: Buffer | null }>
    >`SELECT id, phone_enc, email_enc FROM pii_encryption_candidates()`;

    let repaired = 0;
    for (const row of rows) {
      const phone = this.crypto.readMaybeEncrypted(row.phone_enc);
      const email = this.crypto.readMaybeEncrypted(row.email_enc);
      if (!phone.wasPlaintext && !email.wasPlaintext) continue;

      // Null leaves the column alone, so only what was plaintext is rewritten.
      const nextPhone = phone.wasPlaintext && phone.value
        ? Buffer.from(this.crypto.encrypt(phone.value))
        : null;
      const nextEmail = email.wasPlaintext && email.value
        ? Buffer.from(this.crypto.encrypt(email.value))
        : null;

      await this.prisma.$queryRaw`
        SELECT pii_set_encrypted(${row.id}, ${nextPhone}::bytea, ${nextEmail}::bytea)`;
      repaired++;
    }
    return { checked: rows.length, repaired };
  }
}
