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
    saleSummary: 'TWILIO_TPL_SALE_SUMMARY',
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
    // Claimed through a definer function: `outbox` is under tenant RLS, and
    // this relay spans every brand, so it has no tenant context to run under —
    // a direct query is filtered to nothing. The function also does the
    // claiming, so two API instances polling together take different rows and
    // nobody is messaged twice.
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: Date }>
    >`SELECT id, event_type, payload, created_at FROM claim_txn_alerts(${limit}::int, ${SETTLE_SECONDS}::int)`;

    let sent = 0;
    let skipped = 0;
    for (const sale of groupBySale(rows)) {
      try {
        const ok = await this.handleSale(sale);
        ok ? sent++ : skipped++;
      } catch (e) {
        skipped++;
        this.logger.error(`alert for ${sale.transactionIds.join(', ')} failed: ${(e as Error).message}`);
      }
    }
    if (sent) this.logger.log(`sent ${sent} transaction alert(s)`);
    return { sent, skipped };
  }

  /**
   * One message per sale.
   *
   * A single purchase can both spend a reward and earn points, which used to
   * produce two WhatsApps seconds apart. The events are grouped first, so the
   * customer hears about their visit once.
   */
  private async handleSale(sale: Sale): Promise<boolean> {
    // Everything in one definer call. Each table on this path — outbox,
    // terminal_transaction, customer_membership, person — is under tenant RLS,
    // and this relay spans brands, so a direct read returns nothing.
    const rows = await this.prisma.$queryRaw<{ ctx: AlertContext | null }[]>`
      SELECT txn_alert_context(${sale.anchorTransactionId}) AS ctx`;
    const who = rows[0]?.ctx;
    // Null means opted out, or no phone on file. Either way, nothing to send.
    if (!who) return false;

    const phone = this.reveal(who.phoneEnc);
    if (!phone) return false;

    const receiptToken = who.receiptToken;
    // The template's button is a receipt link; without one there's nothing to
    // link to, so hold the message rather than send a dead button.
    if (!receiptToken) {
      this.logger.warn(`no receipt for ${sale.anchorTransactionId} — alert held`);
      return false;
    }

    const earned = sale.earnedPoints;
    const redeemed = sale.redeemedReward;
    const adjusted = sale.adjustedPoints;

    // Adjustments are their own thing — an apology for a missed visit, not part
    // of a purchase — so they never merge into a sale summary.
    if (adjusted !== null) {
      return this.send('adjusted', phone, [who.firstName, adjusted, who.brandName, receiptToken]);
    }

    if (earned !== null && redeemed !== null) {
      return this.send('saleSummary', phone, [
        who.firstName, who.brandName, redeemed, earned, receiptToken,
      ]);
    }
    if (redeemed !== null) {
      return this.send('redeemed', phone, [who.firstName, redeemed, who.brandName, receiptToken]);
    }
    if (earned !== null) {
      const first = Number(who.priorEarns ?? 0) === 0;
      return this.send(
        first ? 'welcome' : 'earned',
        phone,
        first
          ? [who.firstName, who.brandName, earned, receiptToken]
          : [who.firstName, earned, who.brandName, receiptToken],
      );
    }
    return false;
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

  /**
   * Reads the phone from the definer function's base64 blob.
   *
   * Tolerant of rows still stored in the clear: those used to throw inside a
   * catch that returned null, so the customer looked unreachable and the message
   * vanished. PiiBackfillService repairs them; this makes sure they are still
   * messaged in the meantime.
   */
  private reveal(b64: string | null): string | null {
    if (!b64) return null;
    return this.crypto.readMaybeEncrypted(Buffer.from(b64, 'base64')).value;
  }
}

/**
 * How long an event waits before the relay takes it.
 *
 * Long enough that both halves of one sale — the redemption capture and the
 * earn — are visible together and can be merged into a single message; short
 * enough that the alert still feels like it followed the purchase.
 */
const SETTLE_SECONDS = 20;

/** Events from the same sale: same member, within moments of each other. */
const SALE_WINDOW_MS = 2 * 60 * 1000;

interface AlertEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

interface Sale {
  /** The transaction the message's context and receipt are read from. */
  anchorTransactionId: string;
  transactionIds: string[];
  earnedPoints: string | null;
  redeemedReward: string | null;
  adjustedPoints: string | null;
}

/**
 * Groups events into sales.
 *
 * A purchase that spends a reward and earns points writes two events moments
 * apart for the same member; they belong in one message. Grouped by member and
 * proximity in time rather than by any shared id, because the ledger gives the
 * two halves separate transactions and nothing links them explicitly.
 */
export function groupBySale(events: AlertEvent[]): Sale[] {
  const byMember = new Map<string, AlertEvent[]>();
  for (const e of events) {
    const member = String(e.payload.membershipId ?? '');
    if (!member) continue;
    const list = byMember.get(member);
    list ? list.push(e) : byMember.set(member, [e]);
  }

  const sales: Sale[] = [];
  for (const list of byMember.values()) {
    list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    let current: AlertEvent[] = [];
    for (const e of list) {
      const openedAt = current[0]?.created_at.getTime();
      if (openedAt !== undefined && e.created_at.getTime() - openedAt > SALE_WINDOW_MS) {
        sales.push(toSale(current));
        current = [];
      }
      current.push(e);
    }
    if (current.length) sales.push(toSale(current));
  }
  return sales;
}

function toSale(events: AlertEvent[]): Sale {
  const find = (type: string) => events.find((e) => e.event_type === type);
  const earn = find('points.earned');
  const redeem = find('points.redeemed');
  const adjust = find('points.adjusted');

  // The redemption is the better anchor when present: its transaction is the one
  // the receipt is written against.
  const anchor = redeem ?? adjust ?? earn ?? events[0]!;

  return {
    anchorTransactionId: String(anchor.payload.transactionId ?? ''),
    transactionIds: events.map((e) => String(e.payload.transactionId ?? '')),
    // A zero-point earn isn't worth telling anyone about.
    earnedPoints: earn && Number(earn.payload.points ?? 0) > 0 ? String(earn.payload.points) : null,
    redeemedReward: redeem
      ? ((redeem.payload.rewardName as string) ?? `${String(redeem.payload.points ?? 0)} points`)
      : null,
    adjustedPoints: adjust ? String(adjust.payload.points ?? '0') : null,
  };
}

interface AlertContext {
  membershipId: string;
  personId: string;
  firstName: string;
  phoneEnc: string | null;
  brandName: string;
  pointsCode: string;
  currency: string;
  priorEarns: number;
  receiptToken: string | null;
}
