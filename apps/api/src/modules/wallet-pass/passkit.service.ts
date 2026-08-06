import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform-core/prisma/prisma.service';
import { ApnsService } from './apns.service';
import { AppleWalletService } from './apple-wallet.service';
import { buildPassData } from './pass-data';
import { imagesFor } from './pass-images';

/**
 * The half of Apple Wallet that keeps a pass current after it is added.
 *
 * Issuing a pass is a one-shot signing job. Keeping it live is a conversation:
 * the device registers, we push when something changes, it asks what changed,
 * we hand back a freshly signed pass. This service is our side of that.
 */
@Injectable()
export class PassKitService {
  private readonly logger = new Logger(PassKitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apple: AppleWalletService,
    private readonly apns: ApnsService,
    private readonly config: ConfigService,
  ) {}

  private passTypeId(): string {
    return this.config.get<string>('APPLE_PASS_TYPE_ID') ?? '';
  }

  /**
   * The per-pass token, derived rather than stored.
   *
   * Apple wants a secret in each pass that authenticates the device's later
   * calls. Deriving it from the serial with the app's own key means no table to
   * keep in step with issuance, and reissuing a pass yields the same token —
   * which matters, because a customer who re-adds a card must not orphan the
   * registration the device already made.
   */
  passAuthToken(serialNumber: string): string {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHmac('sha256', secret).update(`pass:${serialNumber}`).digest('hex');
  }

  verifyPassAuth(serialNumber: string, presented: string): boolean {
    const expected = this.passAuthToken(serialNumber);
    // Length check first: timingSafeEqual throws on a mismatch rather than
    // returning false, which would turn a wrong token into a 500.
    if (!presented || presented.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(presented));
  }

  async register(
    deviceLibraryId: string,
    serialNumber: string,
    pushToken: string,
    passTypeId: string,
  ): Promise<{ created: boolean }> {
    const before = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pass_registration
       WHERE device_library_id = ${deviceLibraryId} AND serial_number = ${serialNumber}`;

    await this.prisma.$queryRaw`
      SELECT pass_register_device(${deviceLibraryId}::text, ${serialNumber}::text,
                                  ${pushToken}::text, ${passTypeId}::text)`;

    return { created: Number(before[0]?.n ?? 0) === 0 };
  }

  async unregister(deviceLibraryId: string, serialNumber: string): Promise<void> {
    await this.prisma.$queryRaw`
      SELECT pass_unregister_device(${deviceLibraryId}::text, ${serialNumber}::text)`;
  }

  /**
   * Serials changed since the device last asked.
   *
   * Null means nothing changed, which the controller turns into a 204 — the
   * device then does nothing, rather than refetching every pass it holds.
   */
  async changedSerials(
    deviceLibraryId: string,
    passTypeId: string,
    since: string | undefined,
  ): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
    // Apple echoes back whatever tag we last gave it. We give timestamps, so a
    // tag that is not one means a client we do not recognise — treat it as a
    // first ask rather than failing.
    const sinceDate = since ? new Date(since) : null;
    const valid = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

    const rows = await this.prisma.$queryRaw<{ serial_number: string; updated_at: Date }[]>`
      SELECT * FROM pass_serials_for_device(${deviceLibraryId}::text, ${passTypeId}::text,
                                            ${valid}::timestamptz)`;
    if (rows.length === 0) return null;

    const newest = rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), rows[0]!.updated_at);
    return {
      serialNumbers: rows.map((r) => r.serial_number),
      lastUpdated: newest.toISOString(),
    };
  }

  /**
   * A freshly signed pass for a serial.
   *
   * Built on demand rather than stored: the balance is read at request time, so
   * what the device receives cannot be stale by construction.
   */
  async latestPass(
    serialNumber: string,
    ifModifiedSince: string | undefined,
  ): Promise<{ bytes: Buffer; lastModified: Date } | null> {
    const stateRows = await this.prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM pass_state WHERE serial_number = ${serialNumber}`;
    const lastModified = stateRows[0]?.updated_at ?? new Date();

    if (ifModifiedSince) {
      const since = new Date(ifModifiedSince);
      // Second precision: HTTP dates carry no milliseconds, so comparing
      // directly would resend the pass on every poll.
      if (!Number.isNaN(since.getTime()) &&
          Math.floor(lastModified.getTime() / 1000) <= Math.floor(since.getTime() / 1000)) {
        return null;
      }
    }

    const siteUrl = this.config.get<string>('PUBLIC_SITE_URL') ?? 'https://partnerspoints.ae';
    const data = await buildPassData(this.prisma, serialNumber, siteUrl);
    if (!data) return null;

    const bytes = await this.apple.issue(data, await imagesFor(data));
    if (!bytes) return null;
    return { bytes, lastModified };
  }

  /**
   * Tell every device holding this pass that it changed.
   *
   * Called wherever points move. Failures are swallowed and dead tokens
   * pruned — a wallet refreshing late must never affect the sale that caused
   * it.
   */
  async notifyPassChanged(serialNumber: string): Promise<{ notified: number }> {
    if (!this.apns.configured) return { notified: 0 };
    try {
      const rows = await this.prisma.$queryRaw<{ push_token: string }[]>`
        SELECT * FROM pass_touch_and_devices(${serialNumber}::text)`;
      if (rows.length === 0) return { notified: 0 };

      const { sent, dead } = await this.apns.notify(
        rows.map((r) => r.push_token),
        this.passTypeId(),
      );
      for (const token of dead) {
        await this.prisma.$queryRaw`SELECT pass_drop_push_token(${token}::text)`;
      }
      return { notified: sent };
    } catch (e) {
      this.logger.warn(`pass push failed for ${serialNumber}: ${(e as Error).message}`);
      return { notified: 0 };
    }
  }

  /** Apple's device-side error reports. The only channel that surfaces a pass
   *  the device could not read, so these are logged rather than dropped. */
  recordDeviceLogs(logs: string[]): void {
    for (const line of logs.slice(0, 20)) {
      this.logger.warn(`PassKit device: ${line.slice(0, 300)}`);
    }
  }
}
