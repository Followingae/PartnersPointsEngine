import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Delivers sign-in codes.
 *
 * Codes were previously only written to the server log, which meant no real
 * customer could ever sign in. Which provider carries them is a deployment
 * decision, so this reads one from config rather than hard-coding a vendor:
 *
 *   SMS_PROVIDER=http           — POST to your gateway
 *   SMS_HTTP_URL=https://...    — the endpoint
 *   SMS_HTTP_TOKEN=...          — sent as `Authorization: Bearer …` when set
 *   SMS_SENDER_ID=PartnersPts   — optional alphanumeric sender
 *
 * With no provider configured it falls back to logging and says so loudly,
 * because a silent no-op here looks exactly like a working sign-in until a real
 * customer tries it.
 */
@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return this.config.get<string>('SMS_PROVIDER') === 'http'
      && Boolean(this.config.get<string>('SMS_HTTP_URL'));
  }

  /**
   * Sends the code. Never throws: a delivery failure must not leak whether a
   * number is registered, and the caller has already stored the code — the
   * customer can retry.
   */
  async sendCode(phone: string, code: string): Promise<{ delivered: boolean }> {
    const text = `${code} is your Partners Points code. It expires in 5 minutes.`;

    if (!this.configured) {
      this.logger.warn(
        `[OTP NOT SENT — no SMS provider configured] ${phone} -> ${code}. ` +
        'Set SMS_PROVIDER=http and SMS_HTTP_URL to deliver codes to customers.',
      );
      return { delivered: false };
    }

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
        // The code itself never goes to the log on a configured provider.
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
