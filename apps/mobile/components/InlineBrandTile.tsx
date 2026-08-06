import { Pressable, Text, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import Svg, { Path } from 'react-native-svg';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { Chip, Small } from '@/components/UI';
import type { DiscoverBrand } from '@/lib/api';
import { C, R, font } from '@/lib/tokens';

/**
 * 77 · Inline tile.
 *
 * One per section, dismissible, never two in a row — the design's rule and a
 * good one: a list that suggests something every third row stops being a list.
 *
 * No "Sponsored" label. This is a brand the customer has not joined, surfaced
 * from the same list as everything around it, and nobody is paying for the
 * placement. Saying otherwise would be a false disclosure.
 */
export function InlineBrandTile({
  brand,
  onJoin,
  onDismiss,
}: {
  brand: DiscoverBrand;
  onJoin: () => void;
  onDismiss: () => void;
}) {
  const color = brandColor(brand.brandId, brand.branding);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: C.canvas,
        borderRadius: R.tile,
        paddingLeft: 14,
        paddingRight: 12,
        paddingVertical: 14,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandMark name={brand.brandName} branding={brand.branding} size={34} color={brandFg(color)} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>
          {`${brand.brandName} is worth a look`}
        </Text>
        <Small style={{ marginTop: 2, fontSize: 12, lineHeight: 17 }}>{`Earn ${brand.pointsCode}`}</Small>
      </View>

      <Pressable onPress={onJoin} hitSlop={6}>
        <Chip label="Join" tone="ink" style={{ paddingHorizontal: 14, paddingVertical: 9 }} />
      </Pressable>

      <Pressable onPress={onDismiss} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.soft} strokeWidth={2} strokeLinecap="round">
          <Path d="M6 6l12 12M18 6L6 18" />
        </Svg>
      </Pressable>
    </View>
  );
}
