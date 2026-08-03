import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvelopeCryptoService } from '../../auth/crypto/envelope-crypto.service';
import { SmsSenderService } from '../../auth/otp/sms-sender.service';
import { PrismaService } from '../../platform-core/prisma/prisma.service';

/**
 * Sends the customer a WhatsApp after each transaction.
 *
 * Driven off the transactional outbox rather than the till's request path, which
 * matters for three reasons: the event only exists if the sale committed, a
 * retried sale emits nothing so nobody is messaged twice, and the cashier never
 * waits on Twilio to hand back a receipt.
 *
 * Recipients come from a definer function that already excludes anyone who opted
 * out — enforcing consent at the source rather than trusting each caller.
 */
@Injectable()
export class TxnAlertService {
  private readonly logger = new Logger(TxnAlertService.name);

  /** Meta-approved templates. Business-initiated WhatsApp allows nothing else. */
  private static readonly TEMPLATES = {
    welcome: 'TWILIO_TPL_WELCOME',
    earned: 'TWILIO_TPL_EARNED',
    redeemed: 'TWILIO_TPL_REDEEMED',
    adjusted: 'TWILIO_TPL_ADJUSTED',
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSenderService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Relay a batch of unsent alert events.
   *
   * A row is marked handled whether or not the message got through: a failed
   * WhatsApp is not worth retrying forever, and an alert that arrives an hour
   * late is worse than one that never arrives.
   */
  async relay(limit = 50): Promise<{ sent: number; skipped: number }> {
    // Claim rows atomically before sending. The API runs more than one
    // instance, so two relays can poll at the same moment; SKIP LOCKED means
    // each row is taken by exactly one of them and nobody is messaged twice.
    // Marking published up front also means a crash mid-send loses a message
    // rather than repeating it — the safer direction for something that reaches
    // a customer's phone.
    const rows = await this.prisma.$queryRaw<Array<{ id: string; event_type: string; payload: unknown }>>`
      UPDATE outbox SET published_at = now(), attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM outbox
          WHERE published_at IS NULL AND aggregate = 'points'
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, event_type, payload`;

    let sent = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        const ok = await this.handle(row.event_type, row.payload as Record<string, unknown>);
        ok ? sent++ : skipped++;
      } catch (e) {
        skipped++;
        this.logger.error(`alert for outbox ${row.id} failed: ${(e as Error).message}`);
      }
    }
    if (sent) this.logger.log(`sent ${sent} transaction alert(s)`);
    return { sent, skipped };
  }

  private async handle(eventType: string, payload: Record<string, unknown>): Promise<boolean> {
    const membershipId = payload.membershipId as string | undefined;
    if (!membershipId) return false;

    const rows = await this.prisma.$queryRaw<{ r: Recipient | null }[]>`
      SELECT txn_alert_recipient(${membershipId}) AS r`;
    const who = rows[0]?.r;
    // Null means opted out, or no phone on file. Either way, nothing to send.
    if (!who) return false;

    const phone = this.reveal(who.phoneEnc);
    if (!phone) return false;

    const receiptToken = await this.receiptTokenFor(payload.transactionId as string | undefined);
    // The template's button is a receipt link; without one there's nothing to
    // link to, so hold the message rather than send a dead button.
    if (!receiptToken) return false;

    const points = String(payload.points ?? '0');
    const first = Number(who.priorEarns ?? 0) <= 1;

    switch (eventType) {
      case 'points.earned':
        return this.send(
          first ? 'welcome' : 'earned',
          phone,
          first
            ? [who.firstName, who.brandName, points, receiptToken]
            : [who.firstName, points, who.brandName, receiptToken],
        );
      case 'points.redeemed':
        return this.send('redeemed', phone, [
          who.firstName,
          (payload.rewardName as string) ?? `${points} points`,
          who.brandName,
          receiptToken,
        ]);
      case 'points.adjusted':
        return this.send('adjusted', phone, [who.firstName, points, who.brandName, receiptToken]);
      default:
        return false;
    }
  }

  private async send(
    template: keyof typeof TxnAlertService.TEMPLATES,
    phone: string,
    vars: string[],
  ): Promise<boolean> {
    const sid = this.config.get<string>(TxnAlertService.TEMPLATES[template]);
    if (!sid) {
      this.logger.warn(`no template configured for "${template}" — set ${TxnAlertService.TEMPLATES[template]}`);
      return false;
    }
    const { delivered } = await this.sms.sendTemplate(phone, sid, vars);
    return delivered;
  }

  /** The receipt the message links to, if the till wrote one for this sale. */
  private async receiptTokenFor(transactionId?: string): Promise<string | null> {
    if (!transactionId) return null;
    const txn = await this.prisma.terminalTransaction.findUnique({
      where: { id: transactionId },
      select: { membershipId: true, createdAt: true, brandId: true },
    });
    if (!txn?.membershipId) return null;
    // Receipts carry no transaction id, so match on the member and the moment.
    const receipt = await this.prisma.receipt.findFirst({
      where: {
        brandId: txn.brandId,
        membershipId: txn.membershipId,
        createdAt: { gte: new Date(txn.createdAt.getTime() - 5 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { token: true },
    });
    return receipt?.token ?? null;
  }

  private reveal(b64: string | null): string | null {
    if (!b64) return null;
    try {
      return this.crypto.decrypt(Buffer.from(b64, 'base64'));
    } catch {
      return null;
    }
  }
}

interface Recipient {
  personId: string;
  firstName: string;
  phoneEnc: string | null;
  brandName: string;
  pointsCode: string;
  currency: string;
  priorEarns: number;
}
