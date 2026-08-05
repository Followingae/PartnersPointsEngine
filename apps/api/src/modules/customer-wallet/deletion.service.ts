import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform-core/prisma/prisma.service';

/**
 * Account deletion, scheduled.
 *
 * Apple and Google both require deletion to be startable *and finishable* from
 * inside the app. Anything that waits on staff to act fails review — so the
 * request completes on its own, and the notice period exists for the team to
 * ring someone about their points, not to gate the outcome.
 *
 * Rows are read through the account_deletion definer functions rather than
 * Prisma: the table has no model, and this is person-level work with no tenant
 * context to run under, so a direct query is filtered to nothing by RLS.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** The notice period, in days. Whatever this is, the app must say the same. */
  private get noticeDays(): number {
    const n = Number(this.config.get<string>('ACCOUNT_DELETION_NOTICE_DAYS'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  }

  /**
   * Schedule a deletion.
   *
   * Idempotent by design: asking twice returns the date the customer was
   * already given rather than pushing it further out.
   */
  async request(personId: string, reason?: string) {
    // Every argument is cast: an omitted reason arrives as SQL NULL, which
    // types as `unknown` and fails to resolve the overload rather than simply
    // being null.
    const rows = await this.prisma.$queryRaw<
      { requested_at: Date; scheduled_for: Date }[]
    >`SELECT * FROM wallet_request_deletion(${personId}::text, ${this.noticeDays}::int, ${reason ?? null}::text)`;

    const row = rows[0]!;
    // Logged at warn: this is the queue the team works from, and a deletion
    // going unnoticed for thirty days is the failure worth being loud about.
    this.logger.warn(
      `account deletion requested for person ${personId}, completes ${row.scheduled_for.toISOString()}`,
    );
    return {
      pending: true,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      noticeDays: this.noticeDays,
    };
  }

  /** Stop a scheduled deletion. Safe to call when nothing is scheduled. */
  async cancel(personId: string): Promise<{ cancelled: boolean }> {
    const rows = await this.prisma.$queryRaw<
      { wallet_cancel_deletion: boolean | null }[]
    >`SELECT wallet_cancel_deletion(${personId}::text)`;
    const cancelled = rows[0]?.wallet_cancel_deletion === true;
    if (cancelled) this.logger.log(`account deletion cancelled for person ${personId}`);
    return { cancelled };
  }

  /** What the app shows: nothing scheduled, or the date it happens. */
  async status(personId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        requested_at: Date;
        scheduled_for: Date;
        cancelled_at: Date | null;
        completed_at: Date | null;
      }[]
    >`SELECT * FROM wallet_deletion_status(${personId}::text)`;

    const row = rows[0];
    if (!row || row.cancelled_at || row.completed_at) {
      return { pending: false, noticeDays: this.noticeDays };
    }
    return {
      pending: true,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      noticeDays: this.noticeDays,
    };
  }

  /**
   * Complete every deletion that has come due.
   *
   * Anonymises rather than erases — ledger rows are the merchant's accounting
   * record, and removing them would restate revenue and liability figures that
   * have already been reported on.
   */
  async sweep(limit = 100): Promise<{ completed: number }> {
    const rows = await this.prisma.$queryRaw<{ person_id: string }[]>`
      SELECT * FROM sweep_account_deletions(${limit}::int)`;
    if (rows.length) {
      this.logger.warn(`completed ${rows.length} account deletion(s)`);
    }
    return { completed: rows.length };
  }

  /** The queue the team works from: due soon, not yet completed. */
  async pending(limit = 200) {
    return this.prisma.$queryRaw<
      { person_id: string; requested_at: Date; scheduled_for: Date; reason: string | null }[]
    >`SELECT person_id, requested_at, scheduled_for, reason
        FROM account_deletion
       WHERE cancelled_at IS NULL AND completed_at IS NULL
       ORDER BY scheduled_for
       LIMIT ${limit}::int`;
  }
}
