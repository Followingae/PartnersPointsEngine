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
    // Merchant's own profile (website / socials). Read through a definer
    // function: this page has no tenant context, so a direct select is
    // RLS-filtered to nothing.
    const brandRows = await this.prisma.$queryRaw<{ branding: unknown }[]>`
      SELECT ereceipt_brand(${r.brandId}) AS branding`;
    const brand = (brandRows[0]?.branding ?? {}) as BrandProfile;
    res.status(200).type('html').send(
      shell(`${esc(r.brandName)} — Receipt`, receiptBody(r, ad?.enabled ? ad : null, brand)),
    );
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
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --canvas:#F4F3EF;--card:#fff;--ink:#131310;--muted:#6E6E6B;--faint:#9A9A95;
    --line:#E7E5DE;--lime:#C5F04A;--lime-deep:#6F8A15;--blush:#C23E6E;--radius:26px;
  }
  @media(prefers-color-scheme:dark){
    :root{--canvas:#0d0d10;--card:#17171c;--ink:#F2F2F2;--muted:#A5A5AC;--faint:#71717A;--line:#26262e;--lime-deep:#B8DC3A;--blush:#FF8FBA}
  }
  *{box-sizing:border-box;margin:0}
  body{background:var(--canvas);color:var(--ink);font-family:'Hanken Grotesk',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:440px;margin:0 auto;padding:18px 16px 40px}
  .display{font-family:'Bricolage Grotesque','Hanken Grotesk',sans-serif;letter-spacing:-.02em}
  .mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  .pad{padding:20px 22px}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  .muted{color:var(--muted)}.faint{color:var(--faint)}
  .tiny{font-size:12.5px}.sm{font-size:14px}
  .divider{height:1px;background:var(--line);margin:14px 0}
  .dash{border:0;border-top:1px dashed var(--line);margin:16px 0}
  a{color:inherit}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:15px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px 'Hanken Grotesk',sans-serif;cursor:pointer;text-decoration:none}
  .btn:active{transform:scale(.99)}
  .social{display:flex;flex-wrap:wrap;gap:8px}
  .social a{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13.5px;font-weight:600;text-decoration:none}
  @media print{
    :root{--canvas:#fff;--card:#fff;--ink:#000;--line:#ddd}
    body{background:#fff}
    .wrap{max-width:100%;padding:0}
    .no-print{display:none!important}
    .card{border:1px solid #ddd;break-inside:avoid}
    @page{margin:14mm}
  }
</style></head><body><div class="wrap">${body}</div>
<script>
  function savePdf(){ window.print(); }
</script>
</body></html>`;
}

function notFoundBody(): string {
  return `<div style="text-align:center;padding:80px 0">
    <div style="font-size:44px">🧾</div>
    <h1 style="font-size:22px;margin:12px 0 6px">Receipt not found</h1>
    <p style="color:var(--muted)">This receipt may still be syncing from the store — try again in a minute.</p>
  </div>`;
}

interface BrandProfile {
  primaryColor?: string; logoUrl?: string; website?: string; publicPhone?: string;
  address?: string; city?: string; instagram?: string; facebook?: string; tiktok?: string; x?: string;
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
  },
  ad: { headline?: string; body?: string; ctaLabel?: string; imageUrl?: string } | null,
  brand: BrandProfile,
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
  const hero = `
  <div class="card" style="border:0;background:linear-gradient(155deg, ${color} 0%, ${color}D0 60%, #131310 210%);color:#fff">
    <div style="padding:18px 20px 16px">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo}
        <div style="min-width:0;flex:1">
          <div class="display" style="font-size:18px;font-weight:800;line-height:1.15">${esc(r.brandName)}</div>
          <div class="tiny" style="opacity:.8">${esc(when)}</div>
        </div>
        ${!isSale ? `<span class="mono" style="background:rgba(0,0,0,.3);border-radius:999px;padding:4px 10px;font-size:11px;letter-spacing:.1em">${r.kind.toUpperCase()}</span>` : ''}
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:14px;gap:10px">
        <div>
          <div class="tiny" style="opacity:.75;text-transform:uppercase;letter-spacing:.1em">Total paid</div>
          <div class="display" style="font-size:38px;font-weight:800;line-height:1">${money(r.netMinor, r.currency)}</div>
          <div class="tiny" style="opacity:.8">${esc(tender)}</div>
        </div>
        ${r.earnedPoints > 0n ? `<div style="text-align:right;background:rgba(255,255,255,.16);border-radius:16px;padding:10px 14px">
            <div class="tiny" style="opacity:.85">Earned</div>
            <div class="display" style="font-size:26px;font-weight:800;line-height:1.05">+${pts(r.earnedPoints)}</div>
            <div class="tiny" style="opacity:.85">${esc(r.pointsCode)}</div>
          </div>` : ''}
      </div>
    </div>
  </div>`;

  // ── sponsored: directly under the hero, the highest-value slot ───────────
  const adBlock = ad?.headline
    ? `<a class="card no-print" href="/v1/r/${esc(r.token)}/ad" style="display:flex;align-items:stretch;text-decoration:none;color:inherit;margin-top:12px;overflow:hidden">
        ${ad.imageUrl && /^https:\/\//.test(ad.imageUrl)
          ? `<img src="${esc(ad.imageUrl)}" alt="" style="width:96px;flex:0 0 96px;object-fit:cover">`
          : `<div style="width:6px;flex:0 0 6px;background:var(--lime)"></div>`}
        <div style="padding:13px 15px;min-width:0;flex:1">
          <div class="tiny faint" style="text-transform:uppercase;letter-spacing:.1em">Sponsored</div>
          <div style="font-weight:700;font-size:15px;margin-top:1px">${esc(ad.headline)}</div>
          ${ad.body ? `<div class="tiny muted" style="margin-top:1px">${esc(ad.body)}</div>` : ''}
          <div style="display:inline-block;background:var(--lime);color:#131310;font-weight:700;font-size:12px;border-radius:999px;padding:5px 12px;margin-top:9px">${esc(ad.ctaLabel ?? 'Learn more')} →</div>
        </div>
       </a>`
    : '';

  // ── details: payment + loyalty in a single tight card ────────────────────
  const loyaltyRows = r.memberName
    ? `<hr class="dash">
       <div class="row sm"><span class="muted">Member</span><span style="font-weight:600">${esc(r.memberName)}</span></div>
       ${r.redeemedPoints > 0n ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points used</span><span style="color:var(--blush);font-weight:600">−${pts(r.redeemedPoints)}</span></div>` : ''}
       ${r.balanceAfter != null ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points balance</span><span style="font-weight:700">${pts(r.balanceAfter)} ${esc(r.pointsCode)}</span></div>` : ''}`
    : `<hr class="dash"><div class="tiny muted" style="text-align:center">Give your mobile number at the till next time and earn on every visit.</div>`;

  const details = `
  <div class="card" style="margin-top:12px"><div style="padding:16px 18px">
    <div class="row sm"><span class="muted">Subtotal</span><span>${money(r.grossMinor, r.currency)}</span></div>
    ${r.discountMinor > 0n ? `<div class="row sm" style="margin-top:5px"><span class="muted">Points discount</span><span style="color:var(--blush)">−${money(r.discountMinor, r.currency)}</span></div>` : ''}
    <div class="row sm" style="margin-top:5px"><span class="muted">Paid</span><span style="font-weight:700">${money(r.netMinor, r.currency)}</span></div>
    ${loyaltyRows}
    <div class="row tiny faint mono" style="margin-top:12px">
      <span>${r.authNo ? `Auth ${esc(r.authNo)}` : ''}</span><span>${esc(r.orderNo)}</span>
    </div>
  </div></div>`;

  // ── merchant links ───────────────────────────────────────────────────────
  const socials: string[] = [];
  if (brand.website) socials.push(`<a href="${esc(socialUrl('https://', brand.website))}" target="_blank" rel="noopener">Website</a>`);
  if (brand.instagram) socials.push(`<a href="${esc(socialUrl('https://instagram.com/', brand.instagram))}" target="_blank" rel="noopener">Instagram</a>`);
  if (brand.facebook) socials.push(`<a href="${esc(socialUrl('https://facebook.com/', brand.facebook))}" target="_blank" rel="noopener">Facebook</a>`);
  if (brand.tiktok) socials.push(`<a href="${esc(socialUrl('https://tiktok.com/@', brand.tiktok))}" target="_blank" rel="noopener">TikTok</a>`);
  if (brand.x) socials.push(`<a href="${esc(socialUrl('https://x.com/', brand.x))}" target="_blank" rel="noopener">X</a>`);
  if (brand.publicPhone) socials.push(`<a href="tel:${esc(brand.publicPhone)}">Call</a>`);

  const merchantBlock = (socials.length || brand.address)
    ? `<div style="margin-top:12px;text-align:center">
        ${brand.address ? `<div class="tiny muted">${esc([brand.address, brand.city].filter(Boolean).join(', '))}</div>` : ''}
        ${socials.length ? `<div class="social" style="justify-content:center;margin-top:8px">${socials.join('')}</div>` : ''}
      </div>`
    : '';

  const actions = `
  <div class="no-print" style="margin-top:12px">
    <button type="button" class="btn" onclick="window.print()">⬇︎ Save as PDF</button>
  </div>`;

  return `${hero}${adBlock}${details}${merchantBlock}${actions}
  <div style="text-align:center;margin-top:18px" class="tiny faint">
    Digital receipt · Powered by <b style="color:var(--muted)">Partners Points</b>
  </div>`;
}
