import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SponsoredOffer, brandColor } from '@/components/BrandCard';
import type { Offer } from '@/lib/api';
import { C, font } from '@/lib/tokens';

/**
 * 74, 75, 76 — one hero, three treatments.
 *
 * They differ only in the kicker: a brand line, an offer line, or a countdown
 * when the thing is about to end. Same grid on any brand colour, and the type
 * flips to ink on a light one, which `SponsoredOffer` already handles.
 *
 * The "Sponsored" label appears only when the campaign says it is sponsored.
 * Labelling an ordinary brand promotion as a paid placement is a false
 * disclosure, and there is no billing relationship here that would make it
 * true.
 */

/** Below this a countdown is information; above it, it is just clutter. */
const COUNTDOWN_WITHIN_MS = 48 * 3600_000;

function remaining(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0 || ms > COUNTDOWN_WITHIN_MS) return null;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Ends in ${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function OfferHero({ offer }: { offer: Offer }) {
  const router = useRouter();
  const [countdown, setCountdown] = useState<string | null>(
    offer.endsAt ? remaining(offer.endsAt) : null,
  );

  // Only ticks while a countdown is actually showing.
  useEffect(() => {
    if (!offer.endsAt || countdown === null) return;
    const id = setInterval(() => setCountdown(remaining(offer.endsAt!)), 1000);
    return () => clearInterval(id);
  }, [offer.endsAt, countdown]);

  const color = brandColor(offer.brandId, offer.branding);

  return (
    <View style={{ marginTop: 20 }}>
      <SponsoredOffer
        name={offer.brandName}
        initial={offer.brandName.slice(0, 1).toUpperCase()}
        color={color}
        headline={offer.headline}
        cta={offer.cta}
        onPress={() => router.push(`/merchant/${offer.brandId}`)}
        sponsored={offer.sponsored}
        kicker={countdown ?? offer.kicker ?? null}
      />
    </View>
  );
}
