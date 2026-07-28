import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, H1, Screen, Small, pts } from '@/components/UI';
import { getCards } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';
import { CenterState, Disc, Footer, Ic, TextAction } from '@/components/RewardKit';

/**
 * The redemption landed. The code is the whole point of this screen — it is what
 * the customer reads out at the till if they never open the voucher itself — so
 * it is shown here rather than only one screen further on.
 */
export default function Redeemed() {
  const router = useRouter();
  const { code, pointsSpent, name, brandId } = useLocalSearchParams<{
    code?: string; pointsSpent?: string; name?: string; brandId?: string;
  }>();

  // The burn has already posted, so the wallet is the truthful place to read the
  // balance from. It is a garnish on this screen: if it fails, nothing is lost.
  const { data: cards } = useAsync(getCards, []);
  const card = cards?.find((c) => c.brandId === brandId);

  const spent = pointsSpent ? `${pts(Number(pointsSpent))} pts` : null;
  const line = [name, spent, card ? `balance ${pts(Number(card.available))}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <CenterState>
        <Disc background={C.green}>
          <Ic name="check" size={40} sw={2.4} />
        </Disc>
        <H1 style={{ marginTop: 32, textAlign: 'center' }}>Voucher ready</H1>
        {line ? (
          <Body tone="muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 20, textAlign: 'center' }}>
            {line}
          </Body>
        ) : null}

        {code ? (
          <View style={{
            marginTop: 26, paddingVertical: 14, paddingHorizontal: 24,
            borderRadius: R.control, backgroundColor: C.canvas,
          }}>
            <Text style={{ fontFamily: font(600), fontSize: 19, lineHeight: 26, letterSpacing: 2.4, color: C.ink }}>
              {code}
            </Text>
          </View>
        ) : null}
        <Small style={{ marginTop: 12, fontSize: 12.5, lineHeight: 18 }}>Show this code at the till</Small>
      </CenterState>

      <Footer>
        {code ? <Button label="Show at till" onPress={() => router.replace(`/voucher/${code}`)} /> : null}
        <TextAction label="Later" onPress={() => router.replace('/rewards')} />
      </Footer>
    </Screen>
  );
}
