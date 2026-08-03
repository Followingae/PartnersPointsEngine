import type { Prisma } from '@rfm-loyalty/db';

/**
 * What a card looks like on a phone's wallet, independent of which wallet.
 *
 * Apple and Google model passes very differently — one is a signed bundle, the
 * other a REST object — but both need the same handful of facts. Deriving them
 * once keeps the two implementations from drifting into showing customers
 * different things for the same card.
 */
export interface PassData {
  membershipId: string;
  brandId: string;
  brandName: string;
  /** The QR payload, and the value the till resolves. Kept ≤64 bytes so the
   *  same token could ride an NFC message later without silent truncation. */
  memberToken: string;
  loyaltyId: string;
  pointsCode: string;
  balance: string;
  tier: string | null;
  /** Present only for a stamp card, which the wallets draw differently. */
  stamps: { collected: number; target: number; rewardName: string | null } | null;
  /** Brand fill, `#rrggbb`, already validated. */
  color: string;
  /** How the customer reaches the programme from the pass. */
  siteUrl: string;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** Apple's nfc.message ceiling. Enforced here so QR-now/NFC-later stays open. */
const MAX_TOKEN_BYTES = 64;

export function brandFill(branding: unknown, fallback = '#15150F'): string {
  const c = (branding as { primaryColor?: unknown } | null)?.primaryColor;
  return typeof c === 'string' && HEX6.test(c.trim()) ? c.trim() : fallback;
}

/**
 * Builds the pass view of a membership.
 *
 * The stamp card is whichever repeatable visits challenge the member is
 * furthest through — a wallet pass has room for one, and the one they are
 * closest to finishing is the one worth showing.
 */
export async function buildPassData(
  tx: Prisma.TransactionClient,
  membershipId: string,
  siteUrl: string,
): Promise<PassData | null> {
  const m = await tx.customerMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, loyaltyId: true, brandId: true },
  });
  if (!m) return null;

  // CustomerMembership has no `brand` relation in the schema (brandId is
  // denormalised for flat RLS), so the brand is a separate read.
  const brand = await tx.brand.findUnique({
    where: { id: m.brandId },
    select: { name: true, pointsCurrencyCode: true, branding: true },
  });
  if (!brand) return null;

  if (Buffer.byteLength(m.loyaltyId, 'utf8') > MAX_TOKEN_BYTES) {
    // Loud rather than silent: Apple truncates without complaint, which would
    // produce a pass that scans as a different member.
    throw new Error(`loyalty id exceeds ${MAX_TOKEN_BYTES} bytes and cannot be carried by a pass`);
  }

  const balanceRows = await tx.$queryRaw<{ available: bigint }[]>`
    SELECT (ab.posted_credits - ab.posted_debits - ab.pending_debits) AS available
      FROM ledger_account la JOIN account_balance ab ON ab.account_id = la.id
     WHERE la.account_type = 'points_liability' AND la.customer_id = ${membershipId}
     LIMIT 1`;
  const balance = (balanceRows[0]?.available ?? 0n).toString();

  const tierRow = await tx.$queryRaw<{ name: string }[]>`
    SELECT t.name FROM tier t
     WHERE t.brand_id = ${m.brandId}
       AND t.threshold <= (
         SELECT coalesce(ab.posted_credits, 0) FROM ledger_account la
           JOIN account_balance ab ON ab.account_id = la.id
          WHERE la.account_type = 'points_liability' AND la.customer_id = ${membershipId} LIMIT 1)
     ORDER BY t.threshold DESC LIMIT 1`;

  const stampRow = await tx.challengeProgress.findFirst({
    where: {
      membershipId,
      challenge: { brandId: m.brandId, enabled: true, repeatable: true, kind: 'visits' },
    },
    orderBy: { progress: 'desc' },
    select: {
      progress: true,
      challenge: { select: { target: true, rewardItemId: true } },
    },
  });

  let stamps: PassData['stamps'] = null;
  if (stampRow?.challenge) {
    const reward = stampRow.challenge.rewardItemId
      ? await tx.rewardCatalogItem.findUnique({
          where: { id: stampRow.challenge.rewardItemId },
          select: { name: true },
        })
      : null;
    stamps = {
      collected: Number(stampRow.progress),
      target: Number(stampRow.challenge.target),
      rewardName: reward?.name ?? null,
    };
  }

  return {
    membershipId: m.id,
    brandId: m.brandId,
    brandName: brand.name,
    memberToken: m.loyaltyId,
    loyaltyId: m.loyaltyId,
    pointsCode: brand.pointsCurrencyCode,
    balance,
    tier: tierRow[0]?.name ?? null,
    stamps,
    color: brandFill(brand.branding),
    siteUrl,
  };
}
