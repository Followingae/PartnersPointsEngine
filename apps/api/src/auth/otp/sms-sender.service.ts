import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Delivers sign-in codes.
 *
 * Codes were once only written to the server log, which meant no real customer
 * could sign in. Two providers are supported, chosen by config so credentials
 * never live in the repo:
 *
 *   SMS_PROVIDER=twilio
 *     TWILIO_ACCOUNT_SID=AC…      the account the message is billed to
 *     TWILIO_API_KEY_SID=SK…      API key (preferred over the account token)
 *     TWILIO_API_KEY_SECRET=…
 *     TWILIO_FROM=+9715…          a Twilio number, or an approved sender ID
 *     TWILIO_MESSAGING_SERVICE_SID=MG…   optional, used instead of From
 *     TWILIO_CHANNEL=whatsapp     deliver over WhatsApp instead of SMS
 *     TWILIO_CONTENT_SID=HX…      the approved authentication template
 *
 * WhatsApp matters here beyond preference: a UAE number is hard to reach from
 * an overseas SMS long code, and WhatsApp sidesteps that. It only permits
 * business-initiated messages through a template Meta has approved, so the code
 * is passed as a template variable rather than as free text.
 *
 *   SMS_PROVIDER=http             any gateway that takes a JSON POST
 *     SMS_HTTP_URL, SMS_HTTP_TOKEN, SMS_SENDER_ID
 *
 * With neither configured it falls back to logging and says so loudly, because
 * a silent no-op here looks exactly like working sign-in until a customer tries.
 */
@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  constructor(private readonly config: ConfigService) {}

  private get provider(): 'twilio' | 'http' | 'none' {
    const p = this.config.get<string>('SMS_PROVIDER');
    if (p === 'twilio' && this.twilioReady) return 'twilio';
    if (p === 'http' && this.config.get<string>('SMS_HTTP_URL')) return 'http';
    return 'none';
  }

  private get twilioReady(): boolean {
    return Boolean(
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_API_KEY_SID') &&
      this.config.get<string>('TWILIO_API_KEY_SECRET') &&
      (this.config.get<string>('TWILIO_FROM') ||
        this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID')),
    );
  }

  get configured(): boolean {
    return this.provider !== 'none';
  }

  /**
   * Sends the code. Never throws: a delivery failure must not reveal whether a
   * number is registered, and the code is already stored — the customer can
   * ask for another.
   */
  async sendCode(phone: string, code: string): Promise<{ delivered: boolean }> {
    const text = `${code} is your Partners Points code. It expires in 5 minutes.`;

    switch (this.provider) {
      case 'twilio':
        return this.sendViaTwilio(phone, text, code);
      case 'http':
        return this.sendViaHttp(phone, text);
      default:
        this.logger.warn(
          `[OTP NOT SENT — no SMS provider configured] ${phone} -> ${code}. ` +
          'Set SMS_PROVIDER=twilio with the TWILIO_* variables to deliver codes.',
        );
        return { delivered: false };
    }
  }

  /**
   * Sends an approved WhatsApp template with positional variables.
   *
   * Separate from `sendCode` because these are business-initiated messages about
   * something that just happened, not an authentication code — different
   * templates, different variables, and they must respect the customer's opt-out
   * where a sign-in code must not.
   */
  async sendTemplate(
    phone: string,
    contentSid: string,
    vars: string[],
  ): Promise<{ delivered: boolean }> {
    if (this.provider !== 'twilio') {
      this.logger.warn(`[TEMPLATE NOT SENT — no Twilio provider] ${contentSid} -> ${phone}`);
      return { delivered: false };
    }
    const contentVariables = Object.fromEntries(vars.map((v, i) => [String(i + 1), v]));
    return this.twilioPost(phone, { ContentSid: contentSid, ContentVariables: JSON.stringify(contentVariables) });
  }

  private async sendViaTwilio(
    phone: string,
    text: string,
    code?: string,
  ): Promise<{ delivered: boolean }> {
    const whatsapp = this.config.get<string>('TWILIO_CHANNEL') === 'whatsapp';
    const contentSid = this.config.get<string>('TWILIO_CONTENT_SID');

    // WhatsApp only allows business-initiated messages through an approved
    // template, so the code travels as a template variable, not as free text.
    return whatsapp && contentSid
      ? this.twilioPost(phone, {
          ContentSid: contentSid,
          ContentVariables: JSON.stringify({ '1': code ?? text }),
        })
      : this.twilioPost(phone, { Body: text });
  }

  /**
   * The one place a Twilio message is actually posted. Shared so the sender,
   * channel prefixing and error handling can't drift between the sign-in code
   * path and the transaction-alert path.
   */
  private async twilioPost(
    phone: string,
    fields: Record<string, string>,
  ): Promise<{ delivered: boolean }> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const keySid = this.config.getOrThrow<string>('TWILIO_API_KEY_SID');
    const keySecret = this.config.getOrThrow<string>('TWILIO_API_KEY_SECRET');
    const from = this.config.get<string>('TWILIO_FROM');
    const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');
    const whatsapp = this.config.get<string>('TWILIO_CHANNEL') === 'whatsapp';

    const addr = (n: string) => (whatsapp && !n.startsWith('whatsapp:') ? `whatsapp:${n}` : n);
    const body = new URLSearchParams({ To: addr(phone), ...fields });

    // A messaging service handles sender selection and compliance; a bare From
    // is the simpler setup. Twilio rejects both together.
    if (messagingServiceSid) body.set('MessagingServiceSid', messagingServiceSid);
    else if (from) body.set('From', addr(from));

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            // API key + secret as basic auth — scoped, and revocable without
            // rotating the account's own auth token.
            Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );

      if (!res.ok) {
        // Twilio explains itself well; carry the reason but never the payload.
        const detail = await res.text().catch(() => '');
        const reason = (() => {
          try {
            const j = JSON.parse(detail) as { message?: string; code?: number };
            return j.message ? `${j.message}${j.code ? ` (${j.code})` : ''}` : detail.slice(0, 200);
          } catch {
            return detail.slice(0, 200);
          }
        })();
        this.logger.error(`Twilio rejected the send to ${phone}: ${res.status} ${reason}`);
        return { delivered: false };
      }
      return { delivered: true };
    } catch (e) {
      this.logger.error(`Twilio unreachable for ${phone}: ${(e as Error).message}`);
      return { delivered: false };
    }
  }

  private async sendViaHttp(phone: string, text: string): Promise<{ delivered: boolean }> {
    const url = this.config.getOrThrow<string>('SMS_HTTP_URL');
    const token = this.config.get<string>('SMS_HTTP_TOKEN');
    const sender = this.config.get<string>('SMS_SENDER_ID');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to: phone, text, ...(sender ? { sender } : {}) }),
      });
      if (!res.ok) {
        this.logger.error(`SMS gateway rejected the send for ${phone}: ${res.status}`);
        return { delivered: false };
      }
      return { delivered: true };
    } catch (e) {
      this.logger.error(`SMS gateway unreachable for ${phone}: ${(e as Error).message}`);
      return { delivered: false };
    }
  }
}
