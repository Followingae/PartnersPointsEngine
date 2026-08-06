import type { PrismaClient } from '@rfm-loyalty/db';

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
  /** "Maya K." — shortened, because a pass field is one short line. */
  memberName: string | null;
  /** Joining year, as the design's "Since 2024". */
  memberSince: string;
  /** Present only for a stamp card, which the wallets draw differently. */
  stamps: { collected: number; target: number; rewardName: string | null } | null;
  /** Which glyph fills a stamp — set per brand, defaulting to a star. */
  stampIcon: string;
  /** Brand fill, `#rrggbb`, already validated. */
  color: string;
  /** How the customer reaches the programme from the pass. */
  siteUrl: string;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** Apple's nfc.message ceiling. Enforced here so QR-now/NFC-later stays open. */
const MAX_TOKEN_BYTES = 64;

/**
 * "Maya Khoury" → "Maya K.", which is what the design shows and what fits.
 *
 * A single-word name is left whole rather than reduced to an initial: "Maya"
 * is a name, "M." is not.
 */
function shortName(full: string | null): string | null {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** The brand's chosen stamp glyph. Unset brands get a star rather than nothing. */
export function stampIconOf(branding: unknown): string {
  const v = (branding as { stampIcon?: unknown } | null)?.stampIcon;
  return typeof v === 'string' && v.trim() ? v.trim() : 'star';
}

export function brandFill(branding: unknown, fallback = '#15150F'): string {
  const c = (branding as { primaryColor?: unknown } | null)?.primaryColor;
  return typeof c === 'string' && HEX6.test(c.trim()) ? c.trim() : fallback;
}

interface PassRow {
  membershipId: string;
  brandId: string;
  brandName: string;
  loyaltyId: string;
  pointsCode: string;
  balance: string;
  tier: string | null;
  branding: unknown;
  createdAt: string;
  memberName: string | null;
  stamps: { collected: number; target: number; rewardName: string | null } | null;
}

/**
 * Builds the pass view of a membership.
 *
 * Read through `wallet_pass_data`, a definer function, rather than with Prisma
 * directly. Every table involved is under tenant RLS and this is a person-level
 * call with no tenant to run as — querying them directly returns nothing at
 * all, which surfaced as the pass endpoint answering "card not found" for cards
 * that plainly existed.
 *
 * `personId` is optional: the app supplies it and gets an ownership check, the
 * PassKit web service does not have one and relies on the pass's own token.
 */
export async function buildPassData(
  prisma: PrismaClient,
  membershipId: string,
  siteUrl: string,
  personId?: string,
): Promise<PassData | null> {
  const rows = await prisma.$queryRaw<{ wallet_pass_data: PassRow | null }[]>`
    SELECT wallet_pass_data(${membershipId}::text, ${personId ?? null}::text)`;

  const r = rows[0]?.wallet_pass_data;
  if (!r) return null;

  if (Buffer.byteLength(r.loyaltyId, 'utf8') > MAX_TOKEN_BYTES) {
    // Loud rather than silent: Apple truncates without complaint, which would
    // produce a pass that scans as a different member.
    throw new Error(`loyalty id exceeds ${MAX_TOKEN_BYTES} bytes and cannot be carried by a pass`);
  }

  return {
    membershipId: r.membershipId,
    brandId: r.brandId,
    brandName: r.brandName,
    memberToken: r.loyaltyId,
    loyaltyId: r.loyaltyId,
    pointsCode: r.pointsCode,
    balance: r.balance,
    tier: r.tier,
    memberName: shortName(r.memberName),
    memberSince: String(new Date(r.createdAt).getUTCFullYear()),
    stamps: r.stamps
      ? {
          collected: Number(r.stamps.collected),
          target: Number(r.stamps.target),
          rewardName: r.stamps.rewardName ?? null,
        }
      : null,
    stampIcon: stampIconOf(r.branding),
    color: brandFill(r.branding),
    siteUrl,
  };
}
