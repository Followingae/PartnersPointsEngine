import { View } from 'react-native';
import { C, R } from '@/lib/tokens';

/**
 * 69 · Loading.
 *
 * The shape of the deck rather than a spinner, so the screen does not jump
 * when the cards arrive — the placeholder occupies exactly what replaces it.
 * Static on purpose: an animated shimmer on a screen that usually resolves in
 * under a second reads as slower than no animation at all.
 */
export function CardsSkeleton() {
  return (
    <View style={{ marginTop: 22, gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            height: 148,
            borderRadius: R.card,
            backgroundColor: C.wash,
            // Each one further back than the last, as the real deck sits.
            opacity: 1 - i * 0.28,
          }}
        />
      ))}
    </View>
  );
}
