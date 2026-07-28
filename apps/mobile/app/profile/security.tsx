import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Chevron, SettingsHeader, Toggle } from '@/app/profile/_ui';
import { useTokens } from '@/lib/theme';
import { font } from '@/lib/tokens';

export default function Security() {
  const t = useTokens();
  const [faceId, setFaceId] = useState(true);
  const [pin, setPin] = useState(true);
  return (
    <Screen>
      <SettingsHeader title="Security" />
      <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
        <Pressable onPress={() => setFaceId((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Face ID unlock</Text>
            <Text style={{ fontSize: 12, color: t.soft }}>Open the app with Face ID</Text>
          </View>
          <Toggle on={faceId} />
        </Pressable>
        <Pressable onPress={() => setPin((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>App PIN</Text>
            <Text style={{ fontSize: 12, color: t.soft }}>6-digit fallback code</Text>
          </View>
          <Toggle on={pin} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Manage devices</Text>
          <Text style={{ fontFamily: font.sans(600), fontSize: 12, color: t.soft, marginRight: 6 }}>2 active</Text>
          <Chevron />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16 }}>
          <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>Change phone number</Text>
          <Chevron />
        </View>
      </View>
    </Screen>
  );
}
