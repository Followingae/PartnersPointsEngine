/**
 * On-brand transactional emails.
 *
 * Written as tables with inline styles, because email clients are not browsers:
 * Outlook ignores flexbox and grid, Gmail strips <style> in some clients, and
 * external CSS never arrives. The look is carried by space and type rather than
 * by imagery, which also keeps these readable when a client blocks images.
 *
 * Palette and type follow the app's v3 language so a receipt in the inbox and a
 * card in the app read as the same product.
 */

const CANVAS = '#F4F3EF';
const SURFACE = '#FFFFFF';
const INK = '#15150F';
const MUTED = '#6B6B60';
const SOFT = '#9A9A8E';
const HAIRLINE = '#E6E4DC';
const LIME = '#E1FF3D';

/** Plus Jakarta Sans isn't installed on phones; degrade to the system stack. */
const FONT =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

interface ShellOptions {
  /** Shown by inbox previews under the subject — the one line that earns the open. */
  preheader: string;
  body: string;
  /** Optional footer note above the address block. */
  footnote?: string;
}

function shell({ preheader, body, footnote }: ShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>Partners Points</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <!-- Preview text, then blanks so the client doesn't pull body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <tr>
            <td style="padding:0 4px 26px 4px;">
              <span style="font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.2px;color:${INK};">
                Partners&nbsp;Points
              </span>
            </td>
          </tr>

          ${body}

          <tr>
            <td style="padding:28px 4px 0 4px;">
              ${footnote ? `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:12.5px;line-height:19px;color:${SOFT};">${footnote}</p>` : ''}
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${SOFT};">
                Partners Points · Dubai, UAE
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

/** A white rounded panel — the one container these emails use. */
function panel(inner: string, padding = '32px'): string {
  return `<tr>
    <td style="background:${SURFACE};border-radius:22px;padding:${padding};">
      ${inner}
    </td>
  </tr>`;
}

// ── sign-in code ───────────────────────────────────────────────────────────

export function signInCodeEmail(code: string): { subject: string; html: string; text: string } {
  const spaced = code.split('').join('&nbsp;&nbsp;');
  const body = panel(`
    <p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">
      Your code
    </p>
    <p style="margin:18px 0 0 0;font-family:${FONT};font-size:38px;line-height:46px;font-weight:700;letter-spacing:2px;color:${INK};">
      ${spaced}
    </p>
    <p style="margin:22px 0 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${MUTED};">
      Enter this in the app to sign in. It expires in five minutes.
    </p>
  `);

  return {
    subject: `${code} is your Partners Points code`,
    html: shell({
      preheader: `${code} — expires in five minutes`,
      body,
      footnote: 'If you didn’t ask to sign in, you can ignore this email — nobody can get in without the code.',
    }),
    text: `${code} is your Partners Points code. It expires in five minutes.\n\nIf you didn't ask to sign in, ignore this email.`,
  };
}

// ── receipt ────────────────────────────────────────────────────────────────

export interface ReceiptEmailData {
  brandName: string;
  orderNo: string;
  currency: string;
  netMinor: bigint | number;
  earnedPoints: bigint | number;
  balanceAfter?: bigint | number | null;
  pointsCode: string;
  memberName?: string | null;
  /** Where the full receipt lives — the email is the summary, not the record. */
  receiptUrl: string;
}

const money = (minor: bigint | number, currency: string) =>
  `${currency} ${(Number(minor) / 100).toFixed(2)}`;

const num = (v: bigint | number) => Number(v).toLocaleString('en-US');

export function receiptEmail(d: ReceiptEmailData): { subject: string; html: string; text: string } {
  const earned = Number(d.earnedPoints);

  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;font-family:${FONT};font-size:14.5px;line-height:21px;color:${MUTED};">${esc(label)}</td>
      <td align="right" style="padding:9px 0;font-family:${FONT};font-size:14.5px;line-height:21px;color:${INK};${strong ? 'font-weight:700;' : ''}">${esc(value)}</td>
    </tr>`;

  const body = `
    ${panel(`
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">
        ${esc(d.brandName)}
      </p>
      <p style="margin:14px 0 0 0;font-family:${FONT};font-size:32px;line-height:40px;font-weight:700;letter-spacing:-0.8px;color:${INK};">
        ${esc(money(d.netMinor, d.currency))}
      </p>
      ${earned > 0 ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
        <tr>
          <td style="background:${LIME};border-radius:999px;padding:9px 16px;font-family:${FONT};font-size:13.5px;line-height:20px;font-weight:700;color:${INK};">
            +${num(earned)} ${esc(d.pointsCode)} earned
          </td>
        </tr>
      </table>` : ''}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-top:1px solid ${HAIRLINE};">
        ${row('Paid', money(d.netMinor, d.currency), true)}
        ${d.balanceAfter != null ? row('Points balance', `${num(d.balanceAfter)} ${d.pointsCode}`) : ''}
        ${row('Order', d.orderNo)}
      </table>
    `)}

    <tr><td style="height:14px;line-height:14px;">&nbsp;</td></tr>

    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${INK};border-radius:14px;">
              <a href="${esc(d.receiptUrl)}"
                 style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                View receipt
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return {
    subject: `${d.brandName} — ${money(d.netMinor, d.currency)}`,
    html: shell({
      preheader: earned > 0
        ? `You earned ${num(earned)} ${d.pointsCode} at ${d.brandName}`
        : `Your receipt from ${d.brandName}`,
      body,
    }),
    text: `${d.brandName}\n${money(d.netMinor, d.currency)}${earned > 0 ? `\n+${num(earned)} ${d.pointsCode} earned` : ''}\nOrder ${d.orderNo}\n\nView your receipt: ${d.receiptUrl}`,
  };
}

// ── welcome ────────────────────────────────────────────────────────────────

export function welcomeEmail(d: {
  brandName: string;
  pointsCode: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const body = `
    ${panel(`
      <p style="margin:0;font-family:${FONT};font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.8px;color:${INK};">
        You’re in.
      </p>
      <p style="margin:16px 0 0 0;font-family:${FONT};font-size:16px;line-height:25px;color:${MUTED};">
        Your ${esc(d.brandName)} card is ready. Show your code at the till and you’ll start
        collecting ${esc(d.pointsCode)} on every visit.
      </p>
    `)}

    <tr><td style="height:14px;line-height:14px;">&nbsp;</td></tr>

    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${INK};border-radius:14px;">
              <a href="${esc(d.appUrl)}"
                 style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                Open your card
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return {
    subject: `Your ${d.brandName} card is ready`,
    html: shell({ preheader: `Start collecting ${d.pointsCode} at ${d.brandName}`, body }),
    text: `You're in.\n\nYour ${d.brandName} card is ready. Show your code at the till to start collecting ${d.pointsCode}.\n\n${d.appUrl}`,
  };
}
