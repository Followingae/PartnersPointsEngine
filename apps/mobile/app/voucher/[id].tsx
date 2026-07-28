import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, IconButton, Screen, Small } from '@/components/UI';
import { C, font, shadow } from '@/lib/tokens';
import {
  Footer, Ic, Perforation, QrPlaceholder, ROUND, TextAction, TopBar,
} from '@/components/RewardKit';

/**
 * The till-facing screen. Everything on it exists so a barista can read it at
 * arm's length: brand strip, punched ticket, code, expiry.
 */
export default function Voucher() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO(api): server-issued code — the code and expiry must come from the API,
  // never be derived on the device.
  const voucher = {
    badge: 'CB',
    title: 'Free flat white',
    where: 'Camel Bean · any branch',
    code: 'CB-9K2D-4417',
    expiry: 'Expires 11 Aug · one use',
  };

  return (
    <Screen background={C.surface} scroll={false} bottomGap={30}>
      <TopBar
        right={
          <IconButton style={ROUND}>
            <Ic name="dots" size={18} sw={1.9} />
          </IconButton>
        }
      />

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: C.surface, ...shadow.card }}>
          {/* Brand strip */}
          <View style={{
            backgroundColor: C.orange, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(21,21,15,.17)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontFamily: font(600), fontSize: 12, color: C.ink }}>{voucher.badge}</Text>
            </View>
            <View>
              <Text style={{ fontFamily: font(600), fontSize: 16, color: C.ink }}>{voucher.title}</Text>
              <Text style={{ marginTop: 2, fontFamily: font(500), fontSize: 12, color: C.ink }}>{voucher.where}</Text>
            </View>
          </View>

          {/* The tear line: notches punch through to the page behind. */}
          <Perforation background={C.orange} notch={C.surface} />

          <View style={{ paddingTop: 26, paddingHorizontal: 22, paddingBottom: 24, alignItems: 'center', gap: 20 }}>
            <QrPlaceholder size={150} seed={(id ?? 'v').length + 3} />
            <Text style={{ fontFamily: font(600), fontSize: 17, letterSpacing: 2.4, color: C.ink }}>
              {voucher.code}
            </Text>
            <Small style={{ fontSize: 13 }}>{voucher.expiry}</Small>
          </View>
        </View>
      </View>

      <Footer>
        {/* TODO(api): redeem — mark the voucher used once the till confirms. */}
        <Button label="Mark as used" onPress={() => router.replace('/vouchers')} />
        <TextAction label="Keep for later" onPress={() => (router.canGoBack() ? router.back() : router.replace('/vouchers'))} />
      </Footer>
    </Screen>
  );
}
