import { Text, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { H1, Screen } from '@/components/UI';
import { C, R, T } from '@/lib/tokens';

// TODO(api): GET /customer/streak — which days counted and what keeps it alive.
const DAYS = [
  { label: 'Mon', hit: true },
  { label: 'Tue', hit: true },
  { label: 'Wed', hit: true },
  { label: 'Thu', hit: true },
  { label: 'Fri', hit: false },
  { label: 'Sat', hit: false },
  { label: 'Sun', hit: false },
];

export default function Streak() {
  return (
    <Screen>
      <BackBar fallback="/home" />

      <View style={{ marginTop: 20 }}>
        <H1>Streak</H1>
        <Lede style={{ marginTop: 10 }}>Three weeks in a row at Camel Bean</Lede>
      </View>

      <View style={{ marginTop: 32 }}>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          {DAYS.map((d) => (
            <View
              key={d.label}
              style={{ flex: 1, height: 46, borderRadius: R.control, backgroundColor: d.hit ? C.orange : C.wash }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 10 }}>
          {DAYS.map((d) => (
            <Text key={d.label} style={[T.tiny, { flex: 1, fontSize: 11, textAlign: 'center', color: C.soft }]}>
              {d.label}
            </Text>
          ))}
        </View>

        <Lede style={{ marginTop: 32 }}>
          One visit a week keeps it alive. Four weeks earns a free bag of beans.
        </Lede>
      </View>
    </Screen>
  );
}
