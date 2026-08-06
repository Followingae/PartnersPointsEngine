import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {
  Button, EmptyState, ErrorState, IconButton, Loading, Screen, Small, money, pts,
} from '@/components/UI';
import { C, font, shadow } from '@/lib/tokens';
import { brandColor, brandFg, brandInitials } from '@/components/BrandCard';
import {
  Footer, Ic, Perforation, ROUND, TextAction, TopBar,
} from '@/components/RewardKit';
import { getVouchers, type Voucher } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { shortDate } from '@/lib/dates';

/**
 * The till-facing screen. Everything on it exists so a barista can read it at
 * arm's length: brand strip, punched ticket, code, expiry.
 *
 * Reached both by voucher id and by code — a redemption hands back a code, and
 * that is what a deep link or a receipt carries.
 */

/** Where this voucher stands, in the words a customer and a till both use. */
function statusLine(v: Voucher): string {
  switch (v.status) {
    case 'reserved':
      return 'In use at the till';
    case 'redeemed':
      return v.redeemedAt ? `Used ${shortDate(v.redeemedAt)}` : 'Used';
    case 'expired':
      return v.expiresAt ? `Expired ${shortDate(v.expiresAt)}` : 'Expired';
    case 'void':
      return 'Cancelled';
    default:
      return v.expiresAt ? `Expires ${shortDate(v.expiresAt)} · one use` : 'One use';
  }
}

/** What it is worth, and what it cost — zero points spent means it was a gift. */
function worthLine(v: Voucher): string {
  const parts = [
    v.discountMinor > 0 ? money(v.discountMinor, v.currency) : null,
    v.pointsSpent === '0' ? 'Gifted to you' : `${pts(Number(v.pointsSpent))} points`,
  ];
  return parts.filter(Boolean).join(' · ');
}

export default function VoucherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, signedOut, refresh } = useAsync(() => getVouchers(), []);

  useEffect(() => {
    if (signedOut) router.replace('/onboarding/phone');
  }, [signedOut, router]);

  const key = (id ?? '').toLowerCase();
  const v = data?.find((x) => x.id.toLowerCase() === key || x.code.toLowerCase() === key);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/vouchers'));
  const spendable = v ? v.status === 'issued' || v.status === 'reserved' : false;
  const fill = v ? brandColor(v.brandId, v.branding) : C.orange;
  const fg = brandFg(fill);

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
        {loading ? <Loading /> : null}

        {!loading && error ? <ErrorState message={error} onRetry={refresh} /> : null}

        {!loading && !error && !v ? (
          <EmptyState
            title="We couldn’t find this voucher"
            body="It may have been used already, or belong to another account."
            actionLabel="Back to vouchers"
            onAction={() => router.replace('/vouchers')}
          />
        ) : null}

        {!loading && !error && v ? (
          <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: C.surface, ...shadow.card }}>
            {/* Brand strip */}
            <View style={{
              backgroundColor: fill, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <View style={{
                width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(21,21,15,.17)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <BrandMark name={v.brandName} branding={v.branding} size={30} color={fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font(600), fontSize: 16, lineHeight: 22, color: fg }} numberOfLines={2}>
                  {v.rewardName}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: font(500), fontSize: 12, lineHeight: 17, color: fg }}>
                  {v.brandName}
                </Text>
              </View>
            </View>

            {/* The tear line: notches punch through to the page behind. */}
            <Perforation background={fill} notch={C.surface} />

            <View style={{ paddingTop: 26, paddingHorizontal: 22, paddingBottom: 24, alignItems: 'center', gap: 20 }}>
              {/* A real code: the till scans this to redeem. It used to be a
                  procedural stand-in, which looked scannable and was not. */}
              <QRCode value={v.code} size={150} color={C.ink} backgroundColor={C.surface} ecl="M" />
              <Text style={{ fontFamily: font(600), fontSize: 17, lineHeight: 24, letterSpacing: 2.4, color: C.ink }}>
                {v.code}
              </Text>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Small style={{ fontSize: 13, lineHeight: 18 }}>{statusLine(v)}</Small>
                <Small style={{ fontSize: 13, lineHeight: 18 }} tone="faint">{worthLine(v)}</Small>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <Footer>
        {spendable ? (
          <>
            {/*
              There is no "Mark as used" here on purpose. Only the till can burn
              a voucher, and a button that merely navigated away — leaving the
              voucher live — taught customers that tapping it did something. The
              status arrives on the next fetch after the till redeems it.
            */}
            <TextAction label="Back to vouchers" onPress={back} />
          </>
        ) : (
          <TextAction label="Back to vouchers" onPress={back} />
        )}
      </Footer>
    </Screen>
  );
}
