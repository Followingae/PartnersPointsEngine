import { useState } from 'react';
import { Image, Text, View, type ViewStyle } from 'react-native';
import { brandInitials } from '@/components/BrandCard';
import { font } from '@/lib/tokens';

/**
 * A brand's mark: its logo where one is set, its initials where none is.
 *
 * Brands have been able to upload a logo from the console for as long as the
 * settings screen has existed — the field there even promises it is "shown in
 * the customer mobile app". It never was. Every surface drew initials, so a
 * brand that had done the work saw none of it.
 *
 * The fallback is not a nicety: a logo is a remote image, and remote images
 * fail. A broken one must degrade to the initials rather than leave a hole in
 * the card, so failure is tracked and rendered rather than ignored.
 */
export function BrandMark({
  name,
  branding,
  size,
  color,
  style,
}: {
  name: string;
  branding?: Record<string, unknown> | null;
  /** Edge length of the square the mark sits in. */
  size: number;
  /** Ink for the initials — ignored when a logo renders. */
  color: string;
  style?: ViewStyle;
}) {
  const [failed, setFailed] = useState(false);

  const raw = branding?.logoUrl;
  // Only https: an http image is blocked outright on iOS, and would fall back
  // silently on every render rather than once.
  const url = typeof raw === 'string' && /^https:\/\//i.test(raw.trim()) ? raw.trim() : null;

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        onError={() => setFailed(true)}
        // `contain` because a logo's aspect ratio is the brand's business, not
        // ours — cropping one to a square is how wordmarks lose their words.
        resizeMode="contain"
        accessibilityLabel={name}
        // Only the box is styled here. `style` is a ViewStyle and an Image
        // rejects several of its properties, so it applies to the initials
        // fallback below — which is the only caller that passes one.
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text
        style={{
          fontFamily: font(600),
          // Tracks the tile so initials stay optically centred at any size.
          fontSize: Math.round(size * 0.36),
          lineHeight: Math.round(size * 0.5),
          color,
        }}
      >
        {brandInitials(name)}
      </Text>
    </View>
  );
}
