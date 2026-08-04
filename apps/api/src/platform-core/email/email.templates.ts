/**
 * On-brand transactional emails.
 *
 * Written as tables with inline styles, because email clients are not browsers:
 * Outlook ignores flexbox and grid, Gmail strips <style> in several clients, and
 * external CSS never arrives at all. Every rule that matters is therefore on the
 * element that needs it.
 *
 * The palette and type follow the app so a receipt in the inbox and a card in
 * the app read as one product. Images are used, but never load-bearing: the logo
 * carries alt text and no message depends on an image rendering, because plenty
 * of clients block them by default.
 */

const CANVAS = '#F4F3EF';
const SURFACE = '#FFFFFF';
const INK = '#15150F';
const MUTED = '#5F5F55';
const SOFT = '#93938A';
const HAIRLINE = '#E7E5DD';
const LIME = '#E1FF3D';
const BLUE = '#0B04D9';

const SITE = 'https://partnerspoints.ae';
const LOGO = 'https://api.partnerspoints.ae/v1/assets/logo.png';

/** Plus Jakarta Sans isn't installed on phones; degrade to the system stack. */
const FONT =
  "'Plus Jakarta Sans','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const money = (minor: bigint | number, currency: string) =>
  `${currency} ${(Number(minor) / 100).toFixed(2)}`;

const num = (v: bigint | number) => Number(v).toLocaleString('en-US');

interface ShellOptions {
  /** Shown by inbox previews under the subject — the line that earns the open. */
  preheader: string;
  body: string;
  /** Sits above the footer rule; where the reassurance goes. */
  footnote?: string;
}

function shell({ preheader, body, footnote }: ShellOptions): string {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Partners Points</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-font-smoothing:antialiased;">
  <!-- Preview text, then blanks so the client can't pull body copy in behind it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:36px 18px 44px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <tr>
            <td align="center" style="padding:0 0 28px 0;">
              <a href="${SITE}" style="text-decoration:none;">
                <img src="${LOGO}" width="190" alt="Partners Points"
                     style="display:block;width:190px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td>
          </tr>

          ${body}

          <tr>
            <td style="padding:34px 8px 0 8px;border-top:1px solid ${HAIRLINE};">
              ${footnote
                ? `<p style="margin:22px 0 18px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${footnote}</p>`
                : '<div style="height:22px;line-height:22px;">&nbsp;</div>'}

              <p style="margin:0 0 10px 0;font-family:${FONT};font-size:13px;line-height:20px;">
                <a href="${SITE}" style="color:${BLUE};text-decoration:none;font-weight:600;">partnerspoints.ae</a>
                <span style="color:${SOFT};">&nbsp;·&nbsp;</span>
                <a href="mailto:support@partnerspoints.ae" style="color:${BLUE};text-decoration:none;font-weight:600;">support@partnerspoints.ae</a>
              </p>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:19px;color:${SOFT};">
                One card for every shop you love. Dubai, United Arab Emirates.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The white panel these emails are built from. */
function panel(inner: string, padding = '36px 34px'): string {
  return `<tr>
    <td style="background:${SURFACE};border-radius:24px;padding:${padding};box-shadow:0 1px 2px rgba(21,21,15,.04);">
      ${inner}
    </td>
  </tr>`;
}

/** Ink pill button. Built as a table so Outlook renders the background. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
    <tr>
      <td align="center" style="background:${INK};border-radius:14px;">
        <a href="${esc(href)}"
           style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:#FFFFFF;text-decoration:none;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

const eyebrow = (text: string) => `
  <p style="margin:0;font-family:${FONT};font-size:11.5px;line-height:17px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${SOFT};">
    ${esc(text)}
  </p>`;

// ── sign-in code ───────────────────────────────────────────────────────────

export function signInCodeEmail(code: string): { subject: string; html: string; text: string } {
  const body = `
    ${panel(`
      ${eyebrow('Sign in')}
      <p style="margin:14px 0 0 0;font-family:${FONT};font-size:27px;line-height:35px;font-weight:700;letter-spacing:-0.6px;color:${INK};">
        Here’s your code
      </p>
      <p style="margin:12px 0 0 0;font-family:${FONT};font-size:15.5px;line-height:24px;color:${MUTED};">
        Enter it in the Partners Points app to get back to your cards.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0 0;">
        <tr>
          <td align="center" style="background:${CANVAS};border-radius:18px;padding:26px 16px;">
            <span style="font-family:${FONT};font-size:40px;line-height:48px;font-weight:700;letter-spacing:10px;color:${INK};">${esc(code)}</span>
          </td>
        </tr>
      </table>

      <p style="margin:20px 0 0 0;font-family:${FONT};font-size:13.5px;line-height:21px;color:${SOFT};">
        This code expires in five minutes and can only be used once.
      </p>
    `)}`;

  return {
    subject: `${code} is your Partners Points code`,
    html: shell({
      preheader: `${code} — expires in five minutes`,
      body,
      footnote:
        'Didn’t try to sign in? You can safely ignore this email — nobody can reach your account without the code.',
    }),
    text: `Here's your Partners Points code: ${code}\n\nIt expires in five minutes and can only be used once.\n\nDidn't try to sign in? Ignore this email.\n\npartnerspoints.ae`,
  };
}

// ── receipt ────────────────────────────────────────────────────────────────

export interface ReceiptEmailData {
  brandName: string;
  orderNo: string;
  currency: string;
  grossMinor?: bigint | number;
  discountMinor?: bigint | number;
  netMinor: bigint | number;
  earnedPoints: bigint | number;
  balanceAfter?: bigint | number | null;
  pointsCode: string;
  memberName?: string | null;
  /** Rewards used on this sale, so the email agrees with the printed slip. */
  vouchers?: Array<{ rewardName: string; code: string; discountMinor: number }>;
  /** Campaigns that made this earn bigger — a happy hour, a double-points day. */
  bonuses?: Array<{ name: string; factor?: number; points?: number }>;
  /** Stamp cards finished on this sale. The best news in the whole email. */
  celebrations?: Array<{ challengeName: string; rewardName: string | null; voucherCode: string | null }>;
  /** Where the full receipt lives — this email is the summary, not the record. */
  receiptUrl: string;
}

/**
 * What a campaign did, in three words: "2× points", "+50 points".
 *
 * Trailing zeroes read as precision that isn't there, so 1.50 becomes 1.5 and
 * 2.00 becomes 2.
 */
export function bonusValue(b: { factor?: number; points?: number }): string {
  if (b.factor !== undefined && b.factor !== 1) {
    const x = b.factor % 1 === 0
      ? String(b.factor)
      : b.factor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${x}× points`;
  }
  if (b.points) return `+${num(b.points)} points`;
  return 'Applied';
}

export function receiptEmail(d: ReceiptEmailData): { subject: string; html: string; text: string } {
  const earned = Number(d.earnedPoints);
  const bonuses = d.bonuses ?? [];
  const celebrations = d.celebrations ?? [];
  const gross = d.grossMinor ?? d.netMinor;

  const row = (label: string, value: string, opts: { strong?: boolean; accent?: string } = {}) => `
    <tr>
      <td style="padding:11px 0;font-family:${FONT};font-size:14.5px;line-height:21px;color:${MUTED};">${esc(label)}</td>
      <td align="right" style="padding:11px 0;font-family:${FONT};font-size:14.5px;line-height:21px;color:${opts.accent ?? INK};${opts.strong ? 'font-weight:700;' : ''}">${esc(value)}</td>
    </tr>`;

  const rewardRows = (d.vouchers ?? [])
    .map((v) =>
      row(
        v.rewardName,
        v.discountMinor > 0 ? `− ${money(v.discountMinor, d.currency)}` : 'Applied',
        { accent: BLUE },
      ),
    )
    .join('');

  const body = `
    ${panel(`
      ${eyebrow(d.brandName)}
      <p style="margin:14px 0 0 0;font-family:${FONT};font-size:36px;line-height:44px;font-weight:700;letter-spacing:-1px;color:${INK};">
        ${esc(money(d.netMinor, d.currency))}
      </p>
      <p style="margin:10px 0 0 0;font-family:${FONT};font-size:14.5px;line-height:22px;color:${SOFT};">
        ${d.memberName ? `${esc(d.memberName)} · ` : ''}Order ${esc(d.orderNo)}
      </p>

      ${celebrations.map((c) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0 0;">
        <tr>
          <td style="background:${LIME};border-radius:20px;padding:20px 22px;">
            <p style="margin:0;font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${INK};">
              ${esc(c.challengeName)} complete
            </p>
            <p style="margin:8px 0 0 0;font-family:${FONT};font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.5px;color:${INK};">
              ${c.rewardName ? esc(c.rewardName) + ' is yours' : 'Your reward is ready'}
            </p>
            ${c.voucherCode ? `<p style="margin:10px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">Show this at the till: <strong>${esc(c.voucherCode)}</strong></p>` : ''}
          </td>
        </tr>
      </table>`).join('')}

      ${earned > 0 ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
        <tr>
          <td style="background:${LIME};border-radius:999px;padding:11px 20px;font-family:${FONT};font-size:14px;line-height:21px;font-weight:700;color:${INK};">
            +${num(earned)} ${esc(d.pointsCode)} earned
          </td>
        </tr>
      </table>` : ''}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;border-top:1px solid ${HAIRLINE};">
        ${row('Subtotal', money(gross, d.currency))}
        ${Number(d.discountMinor ?? 0) > 0 ? row('Points discount', `− ${money(d.discountMinor!, d.currency)}`, { accent: BLUE }) : ''}
        ${rewardRows}
        ${bonuses.map((b) => row(b.name, bonusValue(b), { accent: BLUE })).join('')}
        ${row('Paid', money(d.netMinor, d.currency), { strong: true })}
        ${d.balanceAfter != null ? row('Points balance', `${num(d.balanceAfter)} ${d.pointsCode}`) : ''}
      </table>
    `)}

    <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
    <tr><td align="center">${button(d.receiptUrl, 'View full receipt')}</td></tr>`;

  return {
    subject:
      celebrations.length > 0
        ? `${celebrations[0]!.rewardName ?? 'Your reward'} is ready — ${d.brandName}`
        : `${d.brandName} — ${money(d.netMinor, d.currency)}`,
    html: shell({
      preheader:
        celebrations.length > 0
          ? `${celebrations[0]!.rewardName ?? 'Your reward'} is yours at ${d.brandName}`
          : earned > 0
            ? `You earned ${num(earned)} ${d.pointsCode} at ${d.brandName}`
            : `Your receipt from ${d.brandName}`,
      body,
      footnote: 'Keep this for your records, or open the full receipt any time from the app.',
    }),
    text:
      `${d.brandName}\n${money(d.netMinor, d.currency)}\n` +
      `${earned > 0 ? `+${num(earned)} ${d.pointsCode} earned\n` : ''}` +
      bonuses.map((b) => `${b.name}: ${bonusValue(b)}\n`).join('') +
      `Order ${d.orderNo}\n\nFull receipt: ${d.receiptUrl}\n\npartnerspoints.ae`,
  };
}

// ── welcome ────────────────────────────────────────────────────────────────

export function welcomeEmail(d: {
  brandName: string;
  pointsCode: string;
  appUrl: string;
  loyaltyId?: string;
}): { subject: string; html: string; text: string } {
  const step = (n: string, title: string, copy: string) => `
    <tr>
      <td width="34" valign="top" style="padding:0 14px 18px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" width="30" height="30" style="background:${CANVAS};border-radius:999px;font-family:${FONT};font-size:13px;line-height:30px;font-weight:700;color:${INK};">${n}</td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:0 0 18px 0;">
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${INK};">${esc(title)}</p>
        <p style="margin:3px 0 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:${MUTED};">${esc(copy)}</p>
      </td>
    </tr>`;

  const body = `
    ${panel(`
      ${eyebrow('Welcome')}
      <p style="margin:14px 0 0 0;font-family:${FONT};font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.8px;color:${INK};">
        Your ${esc(d.brandName)} card is ready
      </p>
      <p style="margin:12px 0 0 0;font-family:${FONT};font-size:15.5px;line-height:24px;color:${MUTED};">
        It lives in the app alongside every other card you collect — one place for all of them.
      </p>
      ${d.loyaltyId ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0 0;">
        <tr>
          <td style="background:${CANVAS};border-radius:16px;padding:18px 20px;">
            <p style="margin:0;font-family:${FONT};font-size:11.5px;line-height:17px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">Your member number</p>
            <p style="margin:6px 0 0 0;font-family:${FONT};font-size:19px;line-height:26px;font-weight:700;letter-spacing:2px;color:${INK};">${esc(d.loyaltyId)}</p>
          </td>
        </tr>
      </table>` : ''}
    `)}

    <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>

    ${panel(`
      ${eyebrow('How it works')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
        ${step('1', 'Show your code at the till', `The cashier scans it and your ${esc(d.pointsCode)} go on automatically.`)}
        ${step('2', 'Watch the points build', 'Every visit counts toward rewards and the next tier.')}
        ${step('3', 'Spend them on what you like', 'Redeem in the app, or let the cashier apply a reward at checkout.')}
      </table>
    `)}

    <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
    <tr><td align="center">${button(d.appUrl, 'Open your card')}</td></tr>`;

  return {
    subject: `Your ${d.brandName} card is ready`,
    html: shell({
      preheader: `Start collecting ${d.pointsCode} at ${d.brandName}`,
      body,
      footnote: 'Added by mistake? Remove the card any time from your profile in the app.',
    }),
    text:
      `Your ${d.brandName} card is ready.\n\n` +
      `${d.loyaltyId ? `Member number: ${d.loyaltyId}\n\n` : ''}` +
      `1. Show your code at the till — your ${d.pointsCode} go on automatically.\n` +
      `2. Watch the points build with every visit.\n` +
      `3. Spend them in the app or at checkout.\n\n${d.appUrl}\n\npartnerspoints.ae`,
  };
}
