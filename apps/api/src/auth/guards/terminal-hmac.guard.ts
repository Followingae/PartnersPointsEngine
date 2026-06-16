import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { TenantContext } from '@rfm-loyalty/shared';
import { AuthPrismaService } from '../auth-prisma.service';
import { EnvelopeCryptoService } from '../crypto/envelope-crypto.service';
import { HmacService } from '../crypto/hmac.service';
import { NonceStoreService } from '../nonce-store.service';

/**
 * Terminal HMAC auth for the first-party POS fleet (Phase 4 — production path).
 *
 * Parses `Authorization: Loyalty-HMAC publishableKeyId=...,ts=...,nonce=...,sig=...`,
 * enforces the timestamp-skew window + nonce presence, decrypts the per-terminal
 * shared secret, recomputes the canonical signature over the RAW request body, and
 * constant-time compares. Supports overlapping {current, previous} secret rotation.
 */
@Injectable()
export class TerminalHmacGuard implements CanActivate {
  private readonly logger = new Logger(TerminalHmacGuard.name);

  constructor(
    private readonly authDb: AuthPrismaService,
    private readonly hmac: HmacService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly nonces: NonceStoreService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { tenant?: TenantContext; rawBody?: Buffer }>();
    const parsed = this.parseHeader(req.headers.authorization);
    if (!parsed) throw new UnauthorizedException('missing or malformed Loyalty-HMAC authorization');

    const skew = this.config.get<number>('TERMINAL_HMAC_SKEW_SECONDS') ?? 300;
    const ts = Number(parsed.ts);
    if (!Number.isFinite(ts) || !this.hmac.withinSkew(ts, Math.floor(Date.now() / 1000), skew)) {
      throw new UnauthorizedException('timestamp outside allowed skew');
    }
    if (!parsed.nonce || !parsed.sig) throw new UnauthorizedException('missing nonce or signature');

    const key = await this.authDb.apiKey.findUnique({
      where: { publishableId: parsed.publishableKeyId },
    });
    if (!key || key.status === 'revoked') throw new UnauthorizedException('unknown or revoked key');
    if (!key.secretEnc) throw new UnauthorizedException('key has no signing secret');

    const path = (req.originalUrl ?? req.url).split('?')[0]!;
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const canonical = this.hmac.canonical(req.method, path, parsed.ts, parsed.nonce, rawBody);
    const secret = this.crypto.decrypt(key.secretEnc);
    if (!this.hmac.verify(secret, canonical, parsed.sig)) {
      throw new UnauthorizedException('invalid signature');
    }
    // Replay protection: each nonce is single-use within the skew window.
    if (!this.nonces.checkAndRemember(`${parsed.publishableKeyId}:${parsed.nonce}`, skew)) {
      throw new UnauthorizedException('replayed nonce');
    }
    // TODO(Phase 8): persist nonces in Redis to reject replays within the skew window.

    req.tenant = {
      platformId: key.platformId,
      groupId: key.groupId,
      brandId: key.brandId,
      branchId: key.branchId ?? null,
      scopeLevel: 'brand',
      surface: 'terminal',
      actor: { type: 'terminal', id: key.terminalId ?? key.id, onBehalfOf: null },
    };
    return true;
  }

  private parseHeader(
    header: unknown,
  ): { publishableKeyId: string; ts: string; nonce: string; sig: string } | null {
    if (typeof header !== 'string' || !header.startsWith('Loyalty-HMAC ')) return null;
    const parts = header.slice('Loyalty-HMAC '.length).split(',');
    const map: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf('=');
      if (idx > 0) map[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    }
    if (!map.publishableKeyId) return null;
    return {
      publishableKeyId: map.publishableKeyId,
      ts: map.ts ?? '',
      nonce: map.nonce ?? '',
      sig: map.sig ?? '',
    };
  }
}
