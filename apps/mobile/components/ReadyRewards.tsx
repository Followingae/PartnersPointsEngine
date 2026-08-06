import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import { Label, Small } from '@/components/UI';
import type { Voucher } from '@/lib/api';
import { C, R, font } from '@/lib/tokens';

/**
 * Rewards already won and not yet handed over, on Cards.
 *
 * These were only visible under My vouchers, which is somewhere a customer
 * goes when they already remember they have one — the opposite of what an
 * unclaimed reward needs. On the first screen it is a prompt rather than an
 * archive.
 *
 * Redeemed and expired ones are not here on purpose. This is a list of things
 * that can be used today.
 */
export function ReadyRewards({ vouchers }: { vouchers: Voucher[] }) {
  const router = useRouter();
  const ready = vouchers.filter((v) => v.status === 'issued' || v.status === 'reserved');
  if (ready.length === 0) return null;

  return (
    <View style={{ marginTop: 28 }}>
      <Label>Ready to use</Label>

      <View style={{ marginTop: 12, gap: 10 }}>
        {ready.slice(0, 3).map((v) => {
          const color = brandColor(v.brandId, v.branding);
          return (
            <Pressable
              key={v.id}
              onPress={() => router.push(`/voucher/${v.code}`)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  backgroundColor: C.canvas,
                  borderRadius: R.tile,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                },
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 13,
                  backgroundColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BrandMark name={v.brandName} branding={v.branding} size={32} color={brandFg(color)} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}
                >
                  {v.rewardName}
                </Text>
                <Small style={{ marginTop: 2, fontSize: 12, lineHeight: 17 }}>
                  {`${v.brandName} · show ${v.code}`}
                </Small>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
