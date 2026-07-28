import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../platform-core/prisma/prisma.service';

/**
 * Public eReceipt pages — the printed QR on every till receipt lands here.
 * No auth: the unguessable token is the capability (the receipt table is
 * deliberately outside tenant RLS; the platform ad slot is read through a
 * SECURITY DEFINER function). Every view and ad tap is counted for analytics.
 */
@ApiExcludeController()
@Controller('r')
export class ReceiptPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token')
  async view(@Param('token') token: string, @Res() res: Response) {
    const r = await this.prisma.receipt.findUnique({ where: { token } });
    if (!r) {
      res.status(404).type('html').send(shell('Receipt not found', notFoundBody()));
      return;
    }
    await this.prisma.receipt.updateMany({ where: { token, firstViewedAt: null }, data: { firstViewedAt: new Date() } });
    await this.prisma.receipt.update({ where: { token }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });
    const adRows = await this.prisma.$queryRaw<{ ad: unknown }[]>`SELECT ereceipt_ad(${r.platformId}) AS ad`;
    const ad = (adRows[0]?.ad ?? null) as {
      enabled?: boolean; headline?: string; body?: string; ctaLabel?: string; ctaUrl?: string; imageUrl?: string;
    } | null;
    res.status(200).type('html').send(shell(`${esc(r.brandName)} — Receipt`, receiptBody(r, ad?.enabled ? ad : null)));
  }

  @Get(':token/ad')
  async adClick(@Param('token') token: string, @Res() res: Response) {
    const r = await this.prisma.receipt.findUnique({ where: { token }, select: { platformId: true } });
    if (!r) throw new NotFoundException();
    const adRows = await this.prisma.$queryRaw<{ ad: unknown }[]>`SELECT ereceipt_ad(${r.platformId}) AS ad`;
    const ad = (adRows[0]?.ad ?? null) as { ctaUrl?: string } | null;
    await this.prisma.receipt.update({ where: { token }, data: { adClicks: { increment: 1 } } });
    res.redirect(302, ad?.ctaUrl && /^https?:\/\//.test(ad.ctaUrl) ? ad.ctaUrl : 'https://partnerspoints.ae');
  }
}

// ── rendering ────────────────────────────────────────────────────────────────

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (minor: bigint, currency: string) =>
  `${currency} ${(Number(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pts = (v: bigint) => Number(v).toLocaleString('en-US');

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
  :root{--canvas:#FBFAF7;--card:#fff;--ink:#131310;--muted:#6E6E6B;--line:#E7E5DE;--lime:#C5F04A;--lime-deep:#7A9417;--blush:#C23E6E}
  @media(prefers-color-scheme:dark){:root{--canvas:#0f0f13;--card:#1b1b21;--ink:#F2F2F2;--muted:#A5A5AC;--line:#2A2A32;--lime-deep:#A8CC3A;--blush:#FF8FBA}}
  *{box-sizing:border-box;margin:0}
  body{background:var(--canvas);color:var(--ink);font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:430px;margin:0 auto;padding:20px 16px 48px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function notFoundBody(): string {
  return `<div style="text-align:center;padding:80px 0">
    <div style="font-size:44px">🧾</div>
    <h1 style="font-size:22px;margin:12px 0 6px">Receipt not found</h1>
    <p style="color:var(--muted)">This receipt may still be syncing from the store — try again in a minute.</p>
  </div>`;
}

function receiptBody(
  r: {
    brandName: string; brandColor: string | null; kind: string; orderNo: string;
    grossMinor: bigint; discountMinor: bigint; netMinor: bigint; currency: string;
    paymentMethod: string; maskedPan: string | null; authNo: string | null;
    memberName: string | null; earnedPoints: bigint; redeemedPoints: bigint;
    balanceAfter: bigint | null; pointsCode: string; createdAt: Date; token: string;
  },
  ad: { headline?: string; body?: string; ctaLabel?: string; imageUrl?: string } | null,
): string {
  const color = r.brandColor && /^#[0-9a-fA-F]{6}$/.test(r.brandColor) ? r.brandColor : '#131310';
  const when = r.createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  const tender = r.paymentMethod === 'cash' ? 'Cash' : ['Card', r.maskedPan].filter(Boolean).join(' ');
  const banner = r.kind !== 'sale' ? `<div style="text-align:center;font-weight:700;letter-spacing:.12em;color:var(--blush);margin:14px 0">— ${r.kind.toUpperCase()} —</div>` : '';

  const loyalty = r.memberName
    ? `<div style="background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px 20px;margin-top:14px;text-align:center">
        <div style="font-weight:700">${esc(r.memberName)}</div>
        ${r.earnedPoints > 0n ? `<div style="font-size:40px;font-weight:800;letter-spacing:-.02em;color:var(--lime-deep);margin:6px 0 2px">+${pts(r.earnedPoints)} <span style="font-size:15px">${esc(r.pointsCode)}</span></div>` : ''}
        ${r.redeemedPoints > 0n ? `<div style="color:var(--blush);font-weight:600">−${pts(r.redeemedPoints)} ${esc(r.pointsCode)} redeemed</div>` : ''}
        ${r.balanceAfter != null ? `<div style="color:var(--muted);font-size:14px;margin-top:4px">Balance · ${pts(r.balanceAfter)} ${esc(r.pointsCode)}</div>` : ''}
       </div>`
    : `<div style="background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px 20px;margin-top:14px;text-align:center;color:var(--muted)">
        Join ${esc(r.brandName)} rewards next visit — earn on every AED.
       </div>`;

  const adBlock = ad?.headline
    ? `<a href="/v1/r/${esc(r.token)}/ad" style="display:block;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;margin-top:14px">
        ${ad.imageUrl && /^https:\/\//.test(ad.imageUrl) ? `<img src="${esc(ad.imageUrl)}" alt="" style="width:100%;display:block;max-height:160px;object-fit:cover">` : ''}
        <div style="padding:14px 18px">
          <div style="font-weight:700">${esc(ad.headline)}</div>
          ${ad.body ? `<div style="color:var(--muted);font-size:14px;margin-top:2px">${esc(ad.body)}</div>` : ''}
          <div style="display:inline-block;background:var(--lime);color:#131310;font-weight:700;font-size:13px;border-radius:999px;padding:6px 14px;margin-top:10px">${esc(ad.ctaLabel ?? 'Learn more')}</div>
        </div>
       </a>`
    : '';

  return `
  <div style="text-align:center;padding:26px 0 14px">
    <div style="display:inline-block;width:52px;height:52px;border-radius:16px;background:${color};color:#fff;font-weight:800;font-size:22px;line-height:52px">${esc(r.brandName.slice(0, 1))}</div>
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-.01em;margin-top:10px">${esc(r.brandName)}</h1>
    <div style="color:var(--muted);font-size:13.5px">${esc(when)} · Dubai</div>
  </div>
  ${banner}
  <div style="background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px 20px">
    <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:14.5px"><span>Subtotal</span><span>${money(r.grossMinor, r.currency)}</span></div>
    ${r.discountMinor > 0n ? `<div style="display:flex;justify-content:space-between;color:var(--blush);font-size:14.5px;margin-top:4px"><span>Points discount</span><span>−${money(r.discountMinor, r.currency)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px dashed var(--line);margin-top:12px;padding-top:12px">
      <span style="font-weight:700">Total</span><span style="font-size:28px;font-weight:800;letter-spacing:-.02em">${money(r.netMinor, r.currency)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:13px;margin-top:10px"><span>${esc(tender)}</span><span>${r.authNo ? `Auth ${esc(r.authNo)}` : ''}</span></div>
  </div>
  ${loyalty}
  ${adBlock}
  <div style="text-align:center;color:var(--muted);font-size:12px;margin-top:22px">
    Order <span style="font-family:ui-monospace,monospace">${esc(r.orderNo)}</span><br>
    Powered by <b>Partners Points</b>
  </div>`;
}
