import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  receiptEmail, signInCodeEmail, welcomeEmail,
  type ReceiptEmailData,
} from './email.templates';

/**
 * Transactional email, through Resend.
 *
 *   RESEND_API_KEY=re_…
 *   EMAIL_FROM="Partners Points <hello@mail.partnerspoints.ae>"
 *
 * Sending never throws. An email is a courtesy alongside the thing that already
 * happened — a sale is not less real because the receipt didn't arrive — so a
 * delivery failure is logged and reported, never propagated into the caller's
 * transaction.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY'));
  }

  private get from(): string {
    return this.config.get<string>('EMAIL_FROM')
      ?? 'Partners Points <hello@mail.partnerspoints.ae>';
  }

  private async send(
    to: string,
    message: { subject: string; html: string; text: string },
  ): Promise<{ delivered: boolean; id?: string }> {
    if (!this.configured) {
      this.logger.warn(`[EMAIL NOT SENT — no RESEND_API_KEY] ${message.subject} -> ${to}`);
      return { delivered: false };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject: message.subject,
          html: message.html,
          // A plain-text part keeps these out of spam and readable in clients
          // that refuse HTML.
          text: message.text,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`Resend rejected "${message.subject}" to ${to}: ${res.status} ${detail.slice(0, 200)}`);
        return { delivered: false };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { delivered: true, id: body.id };
    } catch (e) {
      this.logger.error(`Resend unreachable for ${to}: ${(e as Error).message}`);
      return { delivered: false };
    }
  }

  sendSignInCode(to: string, code: string) {
    return this.send(to, signInCodeEmail(code));
  }

  sendReceipt(to: string, data: ReceiptEmailData) {
    return this.send(to, receiptEmail(data));
  }

  sendWelcome(
    to: string,
    data: { brandName: string; pointsCode: string; appUrl: string; loyaltyId?: string },
  ) {
    return this.send(to, welcomeEmail(data));
  }
}
