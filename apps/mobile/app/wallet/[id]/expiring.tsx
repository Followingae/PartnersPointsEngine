import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { brandScrim, getBrand } from '@/components/BrandCard';
import { Body, Button, H2, Screen, Small } from '@/components/UI';
import { C, SP, font } from '@/lib/tokens';

/** 16 · Expiring points — a sheet over the dimmed card detail. */

function ExpiryRow({ amount, when, left, urgent, first }: {
  amount: string; when: string; left: string; urgent?: boolean; first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
        borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(21,21,15,.08)',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font(600), fontSize: 14.5, color: C.ink }}>{amount}</Text>
        <Small style={{ marginTop: 3, fontSize: 12.5 }}>{when}</Small>
      </View>
      <Text style={{ fontFamily: font(urgent ? 600 : 500), fontSize: 13, color: urgent ? C.amber : C.muted }}>
        {left}
      </Text>
    </View>
  );
}

function SheetShell({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onDismiss} />
      <View
        style={{
          backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
          paddingTop: 14, paddingHorizontal: SP.gutter, paddingBottom: 32,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(21,21,15,.08)' }} />
        </View>
        {children}
      </View>
    </View>
  );
}

export default function ExpiringPoints() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brand = getBrand(id);

  return (
    <Screen background={brandScrim(brand.color)} scroll={false} pad={false} bottomGap={0}>
      <SheetShell onDismiss={() => router.back()}>
        {/* TODO(api): expiry buckets from the points ledger. */}
        <H2 style={{ marginTop: 22, fontSize: 26, letterSpacing: -0.65 }}>180 pts expiring</H2>
        <Body tone="muted" style={{ marginTop: 10, fontSize: 14 }}>
          Points last 12 months from the day they land.
        </Body>

        <View style={{ marginTop: 22 }}>
          <ExpiryRow first urgent amount="120 pts" when="Expire 12 Aug 2026" left="18 days" />
          <ExpiryRow amount="60 pts" when="Expire 3 Sep 2026" left="40 days" />
        </View>

        <Button
          label="See rewards under 180 pts"
          onPress={() => router.push('/rewards')}
          style={{ marginTop: 26, height: 58, borderRadius: 18 }}
        />
      </SheetShell>
    </Screen>
  );
}
