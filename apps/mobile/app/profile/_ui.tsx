import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackButton } from '@/components/Screen';
import { useTokens } from '@/lib/theme';
import { BRAND, font } from '@/lib/tokens';

/** Right-chevron used on every settings row. */
export function Chevron({ size = 17 }: { size?: number }) {
  const t = useTokens();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth={2.4} strokeLinecap="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** The pill toggle from the design (on = blue, off = chip). Visual; pass onPress to make it interactive. */
export function Toggle({ on }: { on: boolean }) {
  const t = useTokens();
  return (
    <View
      style={{
        width: 46,
        height: 27,
        borderRadius: 999,
        backgroundColor: on ? BRAND.blue : t.chip,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 3,
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={{ width: 21, height: 21, borderRadius: 999, backgroundColor: '#fff' }} />
    </View>
  );
}

/** Back-pill row + big title, the standard secondary-screen header. */
export function SettingsHeader({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTokens();
  return (
    <>
      <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 22 }}>
        <BackButton fallback="/profile" />
      </View>
      <View style={{ paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.display(700), fontSize: 26, letterSpacing: -0.5, color: t.ink }}>{title}</Text>
        {right}
      </View>
    </>
  );
}

/** A standard settings list row (icon/emoji + label + chevron/trailing). */
export function Row({
  emoji,
  label,
  trailing,
  last,
}: {
  emoji?: string;
  label: string;
  trailing?: ReactNode;
  last?: boolean;
}) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 15,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.line,
      }}
    >
      {emoji ? <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{emoji}</Text> : null}
      <Text style={{ flex: 1, fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>{label}</Text>
      {trailing ?? <Chevron />}
    </View>
  );
}

/** A settings row with a title + sub-description and a trailing control (toggle). */
export function SwitchRow({
  title,
  desc,
  on,
  last,
}: {
  title: string;
  desc: string;
  on: boolean;
  last?: boolean;
}) {
  const t = useTokens();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.sans(600), fontSize: 14.5, color: t.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: t.soft, marginTop: 1 }}>{desc}</Text>
      </View>
      <Toggle on={on} />
    </View>
  );
}
