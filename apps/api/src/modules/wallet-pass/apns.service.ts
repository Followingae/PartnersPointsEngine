import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Telling a device its pass has changed.
 *
 * Pass pushes are unlike app notifications: the payload is an empty object and
 * nothing is displayed. It is a nudge — the device wakes, calls our web
 * service, and asks what changed. That is why this needs no message content and
 * no user permission.
 *
 * Requires:
 *   APPLE_APNS_KEY_P8   the .p8 auth key, base64 (or its raw PEM)
 *   APPLE_APNS_KEY_ID   the 10-character Key ID from the same page
 *   APPLE_TEAM_ID       already set for pass signing
 *
 * An auth key is used rather than a certificate because one key covers every
 * topic in the team and does not expire — a pass *certificate* would need
 * replacing yearly alongside the signing one.
 */
@Injectable()
export class ApnsService {
  private readonly logger = new Logger(ApnsService.name);
  private static readonly HOST = 'https://api.push.apple.com';

  /** Provider tokens are valid for an hour; Apple rejects refreshing faster
   *  than every 20 minutes, so this is cached rather than minted per send. */
  private token: { value: string; mintedAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('APPLE_APNS_KEY_P8') &&
        this.config.get<string>('APPLE_APNS_KEY_ID') &&
        this.config.get<string>('APPLE_TEAM_ID'),
    );
  }

  /** Accepts the key base64'd (env-var friendly) or as raw PEM. */
  private privateKey(): string {
    const raw = this.config.getOrThrow<string>('APPLE_APNS_KEY_P8');
    if (raw.includes('BEGIN PRIVATE KEY')) return raw.replace(/\\n/g, '\n');
    return Buffer.from(raw, 'base64').toString('utf8');
  }

  private providerToken(): string {
    const age = this.token ? (Date.now() - this.token.mintedAt) / 1000 : Infinity;
    // Refreshed well inside the hour, and well outside Apple's 20-minute floor.
    if (this.token && age < 1800) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: this.config.getOrThrow<string>('APPLE_APNS_KEY_ID') };
    const claims = { iss: this.config.getOrThrow<string>('APPLE_TEAM_ID'), iat: now };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const input = `${b64(header)}.${b64(claims)}`;

    // ES256 over P-256. The signature must be the raw 64-byte r||s pair, not
    // the DER wrapper Node emits by default — Apple rejects DER with a bare 403
    // and no explanation.
    const sig = createSign('SHA256')
      .update(input)
      .sign({ key: this.privateKey(), dsaEncoding: 'ieee-p1363' })
      .toString('base64url');

    const value = `${input}.${sig}`;
    this.token = { value, mintedAt: Date.now() };
    return value;
  }

  /**
   * Nudge every device holding a pass.
   *
   * Returns the tokens Apple reported as dead so the caller can forget them.
   * Never throws: a wallet that refreshes late is not worth failing a sale for.
   */
  async notify(pushTokens: string[], topic: string): Promise<{ sent: number; dead: string[] }> {
    if (!this.configured || pushTokens.length === 0) return { sent: 0, dead: [] };

    let session: ClientHttp2Session | undefined;
    const dead: string[] = [];
    let sent = 0;

    try {
      const jwt = this.providerToken();
      session = connect(ApnsService.HOST);
      // One connection for the whole batch — Apple rate-limits new ones far
      // more aggressively than requests on an open session.
      await new Promise<void>((resolve, reject) => {
        session!.once('connect', () => resolve());
        session!.once('error', reject);
      });

      for (const token of pushTokens) {
        const result = await this.send(session, jwt, token, topic);
        if (result === 'ok') sent += 1;
        else if (result === 'dead') dead.push(token);
      }
    } catch (e) {
      this.logger.error(`APNs unreachable: ${(e as Error).message}`);
    } finally {
      session?.close();
    }

    return { sent, dead };
  }

  private send(
    session: ClientHttp2Session,
    jwt: string,
    deviceToken: string,
    topic: string,
  ): Promise<'ok' | 'dead' | 'failed'> {
    return new Promise((resolve) => {
      const req = session.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
        authorization: `bearer ${jwt}`,
        // For a pass, the topic is the pass type id — not a bundle id.
        'apns-topic': topic,
        'apns-push-type': 'background',
        'apns-priority': '5',
      });

      let status = 0;
      let body = '';
      req.on('response', (h) => {
        status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      req.on('data', (c: Buffer) => {
        body += c.toString();
      });
      req.on('error', () => resolve('failed'));
      req.on('end', () => {
        if (status === 200) return resolve('ok');
        // 410 means the device is gone; 400 BadDeviceToken means it never was.
        // Both are permanent, and the registration should be dropped.
        if (status === 410 || body.includes('BadDeviceToken')) return resolve('dead');
        this.logger.warn(`APNs ${status}: ${body.slice(0, 120)}`);
        resolve('failed');
      });

      // The payload is deliberately empty — a pass push carries no content.
      req.end('{}');
    });
  }
}
