/**
 * Turning something scanned into a brand.
 *
 * What can be on a QR at a till varies by whoever printed it — a link to the
 * brand's page, a deep link, or just the code itself — so the token is pulled
 * out of whatever came back and then matched against the brands the wallet
 * already knows about. Matching client-side keeps this honest: the app can
 * only ever resolve to a brand that exists, and there is no endpoint to invent.
 */
import type { DiscoverBrand } from '@/lib/api';

/**
 * The last meaningful segment of a scanned value.
 *
 * `https://partnerspoints.ae/join/abc123?src=till` → `abc123`
 * `rfm://join/abc123` → `abc123`
 * `CAMELBEAN` → `camelbean`
 */
export function scanToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Drop a query string or fragment before splitting, so they can't become the
  // last segment of a link that ends in a slash.
  const withoutQuery = trimmed.split(/[?#]/)[0]!;
  const segments = withoutQuery.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? withoutQuery;
  return last.toLowerCase();
}

/** The brand a scanned value points at, or null when nothing matches it. */
export function resolveBrand(raw: string, brands: DiscoverBrand[]): DiscoverBrand | null {
  const token = scanToken(raw);
  if (!token) return null;
  return (
    brands.find(
      (b) =>
        b.brandId.toLowerCase() === token ||
        b.brandSlug.toLowerCase() === token ||
        b.pointsCode.toLowerCase() === token ||
        // Tills print points codes with spaces more often than not.
        b.pointsCode.toLowerCase().replace(/\s+/g, '') === token.replace(/\s+/g, ''),
    ) ?? null
  );
}
