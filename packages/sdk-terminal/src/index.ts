import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Minimal typed client for the RFM Loyalty terminal/POS API. Targets the
 * first-party device runtime (Node). Signs every request with HMAC-SHA256 over
 * the canonical string (method, path, ts, nonce, sha256(body)).
 */
export interface TerminalClientOptions {
  baseUrl: string; // e.g. https://api.rfm-loyalty.example/v1/terminal
  publishableKeyId: string;
  secret: string;
  loyaltyVersion?: string;
  fetchImpl?: typeof fetch;
}

export type IdentifierType = 'phone' | 'email' | 'qr' | 'nfc' | 'loyalty_id' | 'card_token';

export interface CartItem {
  sku: string;
  qty: number;
}

export interface TransactionInput {
  intent: 'earn' | 'redeem';
  memberToken: string;
  idempotencyKey?: string;
  amountMinor?: number;
  items?: CartItem[];
  isVisit?: boolean;
  points?: number;
  sourceEvent?: string;
}

export class TerminalClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TerminalClientOptions) {
    const f = opts.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error('No fetch implementation available');
    this.fetchImpl = f;
  }

  resolve(type: IdentifierType, value: string) {
    return this.post('/members/resolve', { type, value });
  }

  quote(body: { memberToken: string; amountMinor?: number; items?: CartItem[]; isVisit?: boolean; redeemPoints?: number }) {
    return this.post('/quotes', body);
  }

  transaction(input: TransactionInput) {
    return this.post('/transactions', { idempotencyKey: randomUUID(), ...input });
  }

  capture(id: string) {
    return this.post(`/transactions/${id}/capture`, {});
  }

  void(id: string) {
    return this.post(`/transactions/${id}/void`, {});
  }

  get(id: string) {
    return this.request('GET', `/transactions/${id}`);
  }

  batch(operations: TransactionInput[]) {
    return this.post('/transactions/batch', {
      operations: operations.map((o) => ({ idempotencyKey: randomUUID(), ...o })),
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private post(path: string, body: unknown) {
    return this.request('POST', path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = new URL(this.opts.baseUrl.replace(/\/$/, '') + path);
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const canonical = [method.toUpperCase(), url.pathname, ts, nonce, createHash('sha256').update(raw).digest('hex')].join('\n');
    const sig = createHmac('sha256', this.opts.secret).update(canonical).digest('hex');

    const res = await this.fetchImpl(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Loyalty-HMAC publishableKeyId=${this.opts.publishableKeyId},ts=${ts},nonce=${nonce},sig=${sig}`,
        'Loyalty-Version': this.opts.loyaltyVersion ?? 'v1',
      },
      body: method === 'GET' ? undefined : raw,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new TerminalApiError(res.status, json);
    return json;
  }
}

export class TerminalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Terminal API error ${status}`);
    this.name = 'TerminalApiError';
  }
}
