import { Controller, Get, Headers, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
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
  async view(
    @Param('token') token: string,
    @Res() res: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    res.setHeader('Content-Security-Policy', RECEIPT_CSP);
    const r = await this.prisma.receipt.findUnique({ where: { token } });
    if (!r) {
      res.status(404).type('html').send(shell('Receipt not found', notFoundBody()));
      return;
    }
    await this.prisma.receipt.updateMany({ where: { token, firstViewedAt: null }, data: { firstViewedAt: new Date() } });
    await this.prisma.receipt.update({ where: { token }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });
    // Merchant's own profile (website / socials). Read through a definer
    // function: this page has no tenant context, so a direct select is
    // RLS-filtered to nothing.
    const brandRows = await this.prisma.$queryRaw<{ branding: unknown }[]>`
      SELECT ereceipt_brand(${r.brandId}) AS branding`;
    const brand = (brandRows[0]?.branding ?? {}) as BrandProfile;
    res.status(200).type('html').send(
      shell(`${esc(r.brandName)} — Receipt`, receiptBody(r, brand, storeFor(userAgent))),
    );
  }

  /** Real PDF — browsers' print-to-PDF is unreliable on mobile. */
  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    const r = await this.prisma.receipt.findUnique({ where: { token } });
    if (!r) throw new NotFoundException();
    const brandRows = await this.prisma.$queryRaw<{ branding: unknown }[]>`
      SELECT ereceipt_brand(${r.brandId}) AS branding`;
    const brand = (brandRows[0]?.branding ?? {}) as BrandProfile;

    const doc = new PDFDocument({ size: [340, 620], margin: 28 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${r.orderNo}.pdf"`);
    doc.pipe(res);

    const ink = '#15150F';
    const muted = '#6E6E6B';
    const accent = /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor ?? '') ? brand.primaryColor! : ink;
    const when = r.createdAt.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    });

    doc.rect(0, 0, 340, 6).fill(accent);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(r.brandName, 28, 34);
    doc.fillColor(muted).font('Helvetica').fontSize(10).text(when);
    if (r.kind !== 'sale') {
      doc.moveDown(0.6).fillColor('#C2004A').font('Helvetica-Bold').fontSize(12).text(r.kind.toUpperCase());
    }

    doc.moveDown(1.2);
    doc.fillColor(muted).font('Helvetica').fontSize(11).text('Total paid');
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(30).text(money(r.netMinor, r.currency));

    doc.moveDown(0.8);
    const line = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica').fontSize(11).text(label, 28, y);
      doc.fillColor(ink).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11)
        .text(value, 28, y, { width: 284, align: 'right' });
      doc.moveDown(0.45);
    };
    line('Subtotal', money(r.grossMinor, r.currency));
    if (r.discountMinor > 0n) line('Points discount', `-${money(r.discountMinor, r.currency)}`);
    line('Paid', money(r.netMinor, r.currency), true);
    line('Payment', r.paymentMethod === 'cash' ? 'Cash' : ['Card', r.maskedPan].filter(Boolean).join(' '));
    if (r.authNo) line('Auth', r.authNo);

    if (r.memberName) {
      doc.moveDown(0.6);
      doc.strokeColor('#E7E5DE').moveTo(28, doc.y).lineTo(312, doc.y).stroke();
      doc.moveDown(0.8);
      doc.fillColor(muted).font('Helvetica').fontSize(10).text('LOYALTY');
      doc.moveDown(0.3);
      line('Member', r.memberName, true);
      if (r.earnedPoints > 0n) line('Points earned', `+${pts(r.earnedPoints)} ${r.pointsCode}`, true);
      if (r.redeemedPoints > 0n) line('Points redeemed', `-${pts(r.redeemedPoints)} ${r.pointsCode}`);
      if (r.balanceAfter != null) line('Balance', `${pts(r.balanceAfter)} ${r.pointsCode}`, true);
    }

    const contact = [brand.website, brand.instagram ? `@${brand.instagram.replace(/^@/, '')}` : null, brand.publicPhone]
      .filter(Boolean).join('   ·   ');
    doc.moveDown(1.2);
    doc.fillColor(muted).font('Helvetica').fontSize(9)
      .text(`Order ${r.orderNo}`, 28, doc.y, { width: 284, align: 'center' });
    if (contact) doc.text(contact, { width: 284, align: 'center' });
    doc.text('Powered by Partners Points', { width: 284, align: 'center' });
    doc.end();
  }

}

// ── rendering ────────────────────────────────────────────────────────────────

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (minor: bigint, currency: string) =>
  `${currency} ${(Number(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pts = (v: bigint) => Number(v).toLocaleString('en-US');

interface ReceiptVoucher { code: string; rewardName: string; discountMinor: number }

interface StoreLink { label: string; url: string }

/**
 * Which app store to point a reader at.
 *
 * Decided from the User-Agent server-side because this page deliberately carries
 * no JavaScript — its CSP has no `script-src` at all, so feature detection in the
 * browser isn't available. A desktop reader gets nothing rather than a guess;
 * they're not going to install a phone app from a laptop.
 */
function storeFor(userAgent?: string): StoreLink | null {
  const ua = userAgent ?? '';
  const site = process.env.APP_SITE_URL ?? 'https://partnerspoints.ae';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return { label: 'Get the app', url: process.env.APP_STORE_URL ?? site };
  }
  if (/Android/i.test(ua)) {
    return { label: 'Get the app', url: process.env.PLAY_STORE_URL ?? site };
  }
  return null;
}

/** Receipt.vouchers is free-form JSON; only trust rows that actually look right. */
function receiptVouchers(raw: unknown): ReceiptVoucher[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (!v || typeof v !== 'object') return [];
    const { code, rewardName, discountMinor } = v as Record<string, unknown>;
    if (typeof code !== 'string' || typeof rewardName !== 'string') return [];
    return [{ code, rewardName, discountMinor: typeof discountMinor === 'number' ? discountMinor : 0 }];
  });
}

/**
 * The app-wide helmet() CSP is `img-src 'self' data:` and `script-src 'self'`,
 * which blocks merchants' ad images (hosted on their own CDNs) on this page.
 * These public pages get their own policy: remote images allowed, scripts
 * forbidden outright (the page carries no JS at all).
 */
const RECEIPT_CSP = [
  "default-src 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --canvas:#F4F3EF;--card:#fff;--ink:#15150F;--muted:#5A5A55;--faint:#7C7C76;
    --line:#E3E1DA;--lime:#C5F04A;--lime-deep:#5E7712;--blush:#C2004A;--radius:26px;
  }
  @media(prefers-color-scheme:dark){
    :root{--canvas:#0d0d10;--card:#17171c;--ink:#F5F5F2;--muted:#B8B8B2;--faint:#94948E;--line:#2A2A32;--lime-deep:#C7E85A;--blush:#FF8FBA}
  }
  *{box-sizing:border-box;margin:0}
  body{background:var(--canvas);color:var(--ink);font-family:'Hanken Grotesk',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:440px;margin:0 auto;padding:18px 16px 96px}
  .display{font-family:'Bricolage Grotesque','Hanken Grotesk',sans-serif;letter-spacing:-.02em}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  .pad{padding:20px 22px}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  /* readability: muted text was too light against the warm canvas */
  .muted{color:var(--muted)}.faint{color:var(--faint)}
  .tiny{font-size:13.5px}.sm{font-size:15px}
  .divider{height:1px;background:var(--line);margin:14px 0}
  .dash{border:0;border-top:1px dashed var(--line);margin:16px 0}
  a{color:inherit}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:15px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px 'Hanken Grotesk',sans-serif;cursor:pointer;text-decoration:none}
  .btn:active{transform:scale(.99)}
  .social{display:flex;flex-wrap:wrap;gap:8px}
  .social a{display:inline-flex;align-items:center;gap:7px;padding:10px 15px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:14px;font-weight:600;text-decoration:none;color:var(--ink)}
  .social a svg{flex:0 0 auto;opacity:.75}
  .btn svg{flex:0 0 auto}
  /* Get-the-app prompt, docked bottom-right.
     Sits on the card surface with a hairline rather than a slab of ink — a
     black lozenge over a light receipt read as an error toast. Our own mark
     rather than Apple's or Google's badge artwork, which has usage rules we
     shouldn't approximate; drop the licensed assets in when they exist. */
  .getapp{
    position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:6;
    display:inline-flex;align-items:center;gap:10px;
    padding:9px 15px 9px 9px;border-radius:999px;
    background:var(--card);color:var(--ink);text-decoration:none;
    border:1px solid var(--line);
    box-shadow:0 10px 30px -14px rgba(21,21,15,.45),0 1px 2px rgba(21,21,15,.05);
    max-width:calc(100vw - 28px);
  }
  .getapp-mark{
    flex:0 0 auto;display:grid;place-items:center;
    width:30px;height:30px;border-radius:10px;
    background:#1B1AE5;color:#fff;
  }
  .getapp-text{display:flex;flex-direction:column;gap:1px;min-width:0}
  .getapp-text b{font-size:13px;font-weight:650;line-height:1.25;letter-spacing:-.01em}
  .getapp-text span{
    font-size:11.5px;line-height:1.25;color:var(--faint);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  /* On a narrow screen the strapline is the first thing to go, not the name. */
  @media (max-width:400px){ .getapp-text span{display:none} .getapp{padding:8px 14px 8px 8px} }

  @media print{
    :root{--canvas:#fff;--card:#fff;--ink:#000;--line:#ddd}
    body{background:#fff}
    .wrap{max-width:100%;padding:0}
    .no-print,.getapp{display:none!important}
    .card{border:1px solid #ddd;break-inside:avoid}
    @page{margin:14mm}
  }
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function notFoundBody(): string {
  return `<div style="text-align:center;padding:80px 0">
    <div style="font-size:44px">🧾</div>
    <h1 style="font-size:22px;margin:12px 0 6px">Receipt not found</h1>
    <p style="color:var(--muted)">This receipt may still be syncing from the store — try again in a minute.</p>
  </div>`;
}

/** Inline 1.7px-stroke icons — no external requests, print cleanly. */
const svg = (paths: string) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON = {
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>'),
  facebook: svg('<path d="M14.5 8.5H17V5.5h-2.5A3.5 3.5 0 0 0 11 9v2H9v3h2v7h3v-7h2.2l.8-3H14V9.2c0-.4.2-.7.5-.7z"/>'),
  tiktok: svg('<path d="M15 4v9.2a3.8 3.8 0 1 1-3-3.7"/><path d="M15 4c.5 2.2 2 3.6 4.2 3.8"/>'),
  x: svg('<path d="M4 4l16 16M20 4L4 20"/>'),
  phone: svg('<path d="M5 4h3.5l1.6 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.6V19a1.6 1.6 0 0 1-1.8 1.6A15.5 15.5 0 0 1 3.4 5.8 1.6 1.6 0 0 1 5 4z"/>'),
  download: svg('<path d="M12 4v11M7.5 11l4.5 4.5L16.5 11M5 19h14"/>'),
} as const;

interface BrandProfile {
  primaryColor?: string; logoUrl?: string; website?: string; publicPhone?: string;
  address?: string; city?: string; instagram?: string; facebook?: string; tiktok?: string; x?: string;
}

/**
 * Pick readable text for a brand-coloured surface. A lime or pastel brand needs
 * ink; a navy or maroon needs white. Relative luminance per WCAG.
 */
function onColor(hex: string): { fg: string; dim: string; chip: string } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { fg: '#fff', dim: 'rgba(255,255,255,.82)', chip: 'rgba(255,255,255,.18)' };
  const int = parseInt(m[1]!, 16);
  const srgb = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
  // contrast against white vs against near-black ink
  return lum > 0.42
    ? { fg: '#15150F', dim: 'rgba(21,21,15,.68)', chip: 'rgba(21,21,15,.10)' }
    : { fg: '#fff', dim: 'rgba(255,255,255,.82)', chip: 'rgba(255,255,255,.18)' };
}

/** Normalize a handle or URL into a full link. */
function socialUrl(base: string, v: string): string {
  const s = v.trim().replace(/^@/, '');
  return /^https?:\/\//i.test(s) ? s : `${base}${s}`;
}

function receiptBody(
  r: {
    brandName: string; brandColor: string | null; kind: string; orderNo: string;
    grossMinor: bigint; discountMinor: bigint; netMinor: bigint; currency: string;
    paymentMethod: string; maskedPan: string | null; authNo: string | null;
    memberName: string | null; earnedPoints: bigint; redeemedPoints: bigint;
    balanceAfter: bigint | null; pointsCode: string; createdAt: Date; token: string;
    vouchers?: unknown;
  },
  brand: BrandProfile,
  store: StoreLink | null,
): string {
  const color = /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor ?? '')
    ? brand.primaryColor!
    : (r.brandColor && /^#[0-9a-fA-F]{6}$/.test(r.brandColor) ? r.brandColor : '#131310');
  const when = r.createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  const tender = r.paymentMethod === 'cash' ? 'Cash' : ['Card', r.maskedPan].filter(Boolean).join(' ');
  const isSale = r.kind === 'sale';

  const logo = brand.logoUrl && /^https:\/\//.test(brand.logoUrl)
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(r.brandName)}" style="height:40px;width:40px;flex:0 0 40px;object-fit:contain;border-radius:12px;background:#fff;padding:3px">`
    : `<div style="width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:rgba(255,255,255,.22);color:#fff;font:800 18px 'Bricolage Grotesque',sans-serif;line-height:40px;text-align:center">${esc(r.brandName.slice(0, 1))}</div>`;

  // ── hero: identity + total + loyalty, one compact block ──────────────────
  // Text colour is derived from the brand colour so a lime brand doesn't get
  // unreadable white text.
  const ink = onColor(color);
  const paidWithPoints = r.netMinor === 0n && r.discountMinor > 0n;
  const hero = `
  <div class="card" style="border:0;background:linear-gradient(150deg, ${color} 0%, ${color} 55%, ${color}D8 100%);color:${ink.fg}">
    <div style="padding:18px 20px 17px">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo}
        <div style="min-width:0;flex:1">
          <div class="display" style="font-size:19px;font-weight:800;line-height:1.15;color:${ink.fg}">${esc(r.brandName)}</div>
          <div class="tiny" style="color:${ink.dim}">${esc(when)}</div>
        </div>
        ${!isSale ? `<span class="mono" style="background:${ink.chip};border-radius:999px;padding:4px 10px;font-size:11px;letter-spacing:.1em;color:${ink.fg}">${r.kind.toUpperCase()}</span>` : ''}
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:16px;gap:10px">
        <div style="min-width:0">
          <div class="tiny" style="color:${ink.dim};text-transform:uppercase;letter-spacing:.1em">${paidWithPoints ? 'Paid with points' : 'Total paid'}</div>
          <div class="display" style="font-size:36px;font-weight:800;line-height:1.05;color:${ink.fg}">${money(r.netMinor, r.currency)}</div>
          <div class="tiny" style="color:${ink.dim}">${esc(tender)}</div>
        </div>
        ${r.earnedPoints > 0n ? `<div style="text-align:right;background:${ink.chip};border-radius:16px;padding:10px 14px;flex:none">
            <div class="tiny" style="color:${ink.dim}">Earned</div>
            <div class="display" style="font-size:26px;font-weight:800;line-height:1.05;color:${ink.fg}">+${pts(r.earnedPoints)}</div>
            <div class="tiny" style="color:${ink.dim}">${esc(r.pointsCode)}</div>
          </div>` : ''}
      </div>
    </div>
  </div>`;

  // ── sponsored: directly under the hero, the highest-value slot ───────────
  // Full-bleed image on top, like the console preview. A dead URL removes the
  // whole <img> (a hidden-but-present element still showed a broken frame).
  // Compact bar docked to the bottom of the viewport: always in view while the
  // receipt scrolls behind it, without eating a screenful. No JS (CSP-free page).
  // ── details: payment + loyalty in a single tight card ────────────────────
  const loyaltyRows = r.memberName
    ? `<hr class="dash">
       <div class="row sm"><span class="muted">Member</span><span style="font-weight:600">${esc(r.memberName)}</span></div>
       ${r.redeemedPoints > 0n ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points used</span><span style="color:var(--blush);font-weight:600">−${pts(r.redeemedPoints)}</span></div>` : ''}
       ${r.balanceAfter != null ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points balance</span><span style="font-weight:700">${pts(r.balanceAfter)} ${esc(r.pointsCode)}</span></div>` : ''}`
    : `<hr class="dash"><div class="tiny muted" style="text-align:center">Give your mobile number at the till next time and earn on every visit.</div>`;

  // Rewards handed over on this sale, with their numbers — the customer's and the
  // merchant's shared record that the voucher was actually used here.
  const rewardRows = receiptVouchers(r.vouchers)
    .map(
      (v) => `<div class="row sm" style="margin-top:5px">
        <span class="muted">${esc(v.rewardName)} <span class="mono tiny" style="color:var(--faint)">${esc(v.code)}</span></span>
        <span style="color:var(--blush);font-weight:600">${v.discountMinor > 0 ? `−${money(BigInt(v.discountMinor), r.currency)}` : 'Applied'}</span>
      </div>`,
    )
    .join('');

  const details = `
  <div class="card" style="margin-top:12px"><div style="padding:16px 18px">
    <div class="row sm"><span class="muted">Subtotal</span><span>${money(r.grossMinor, r.currency)}</span></div>
    ${r.discountMinor > 0n ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points discount</span><span style="color:var(--blush)">−${money(r.discountMinor, r.currency)}</span></div>` : ''}
    ${rewardRows}
    <div class="row sm" style="margin-top:5px"><span class="muted">Paid</span><span style="font-weight:700">${money(r.netMinor, r.currency)}</span></div>
    ${loyaltyRows}
    <div class="row tiny mono" style="margin-top:12px;color:var(--faint)">
      <span style="color:var(--faint)">${r.authNo ? `Auth ${esc(r.authNo)}` : ''}</span>
      <span style="color:var(--faint)">${esc(r.orderNo)}</span>
    </div>
  </div></div>`;

  // ── merchant links ───────────────────────────────────────────────────────
  const socials: string[] = [];
  const socialLink = (href: string, icon: string, label: string) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener">${icon}<span>${label}</span></a>`;
  if (brand.website) socials.push(socialLink(socialUrl('https://', brand.website), ICON.globe, 'Website'));
  if (brand.instagram) socials.push(socialLink(socialUrl('https://instagram.com/', brand.instagram), ICON.instagram, 'Instagram'));
  if (brand.facebook) socials.push(socialLink(socialUrl('https://facebook.com/', brand.facebook), ICON.facebook, 'Facebook'));
  if (brand.tiktok) socials.push(socialLink(socialUrl('https://tiktok.com/@', brand.tiktok), ICON.tiktok, 'TikTok'));
  if (brand.x) socials.push(socialLink(socialUrl('https://x.com/', brand.x), ICON.x, 'X'));
  if (brand.publicPhone) socials.push(`<a href="tel:${esc(brand.publicPhone)}">${ICON.phone}<span>Call</span></a>`);

  const merchantBlock = (socials.length || brand.address)
    ? `<div style="margin-top:12px;text-align:center">
        ${brand.address ? `<div class="tiny muted">${esc([brand.address, brand.city].filter(Boolean).join(', '))}</div>` : ''}
        ${socials.length ? `<div class="social" style="justify-content:center;margin-top:8px">${socials.join('')}</div>` : ''}
      </div>`
    : '';

  // A real generated PDF — mobile browsers handle print-to-PDF badly.
  const actions = `
  <div class="no-print" style="margin-top:12px">
    <a class="btn" href="/v1/r/${esc(r.token)}/pdf" target="_blank" rel="noopener">${ICON.download} Download PDF</a>
  </div>`;

  /**
   * Get-the-app prompt, docked bottom-right.
   *
   * Carries the Partners Points mark rather than a phone glyph, sits on the
   * card surface rather than a slab of ink, and says what it gets you. The
   * previous version was a black lozenge that read as an error toast.
   */
  const appBlock = store
    ? `<a class="getapp no-print" href="${esc(store.url)}">
         <span class="getapp-mark" aria-hidden="true">
           <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
             <path d="M12 1.6c.55 4.9 3.4 8 8.4 8.9v3c-5 .9-7.85 4-8.4 8.9-.55-4.9-3.4-8-8.4-8.9v-3c5-.9 7.85-4 8.4-8.9Z"/>
           </svg>
         </span>
         <span class="getapp-text">
           <b>Partners Points</b>
           <span>Keep every card in one app</span>
         </span>
       </a>`
    : '';

  return `${hero}${details}${merchantBlock}${actions}
  <div style="text-align:center;margin-top:18px" class="tiny faint">
    Digital receipt · Powered by <b style="color:var(--muted)">Partners Points</b>
  </div>
  ${appBlock}`;
}
