import { createHash, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthPrismaService } from '../auth-prisma.service';
import { SmsSenderService } from './sms-sender.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** How long a code is good for. */
const TTL_SECONDS = 5 * 60;
/** Wrong guesses before the code dies — brute force is 1-in-a-million per try. */
const MAX_ATTEMPTS = 5;
/** Sends allowed per number per window, so this endpoint can't be used to spam someone. */
const MAX_SENDS = 5;
const WINDOW_SECONDS = 15 * 60;

export interface OtpIssueResult {
  sent: boolean;
  /** Set when the number is rate-limited. */
  retryAfterSeconds?: number;
  /** False when no SMS provider is configured — the code was only logged. */
  delivered: boolean;
}

/**
 * Phone sign-in codes.
 *
 * Stored in Postgres rather than in memory: a code issued by one instance has
 * to be verifiable by another and has to survive a deploy, or customers get
 * locked out mid-restart. Both the store and the rate limit live in SECURITY
 * DEFINER functions because sign-in happens before any tenant context exists.
 */
@Injectable()
export class OtpStoreService {
  constructor(
    private readonly db: AuthPrismaService,
    private readonly sms: SmsSenderService,
  ) {}

  /** Issue a code, rate-limit the number, and send it. */
  async issue(phone: string): Promise<OtpIssueResult> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // The ::int casts matter: Prisma sends JS numbers as bigint, which doesn't
    // resolve against an int parameter.
    const rows = await this.db.$queryRaw<{ result: { sent: boolean; retryAfterSeconds?: number } }[]>`
      SELECT otp_issue(
        ${sha256(phone)}, ${sha256(code)},
        ${TTL_SECONDS}::int, ${MAX_SENDS}::int, ${WINDOW_SECONDS}::int
      ) AS result`;
    const result = rows[0]!.result;
    if (!result.sent) {
      return { sent: false, retryAfterSeconds: result.retryAfterSeconds, delivered: false };
    }
    const { delivered } = await this.sms.sendCode(phone, code);
    return { sent: true, delivered };
  }

  /** Verify and consume a code. */
  async verify(phone: string, code: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ ok: boolean }[]>`
      SELECT otp_verify(${sha256(phone)}, ${sha256(code)}, ${MAX_ATTEMPTS}::int) AS ok`;
    return rows[0]?.ok === true;
  }
}
