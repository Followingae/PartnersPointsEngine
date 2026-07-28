/**
 * Person-level presentation helpers.
 *
 * Brand fills and brand initials live in `@/components/BrandCard`, next to the
 * card that defines them. This is the one thing that isn't about a brand.
 */

/** Initials for a person — first and last name, one letter each. */
export function personInitials(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
