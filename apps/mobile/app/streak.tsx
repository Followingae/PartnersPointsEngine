import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BackBar, Lede } from '@/components/Bits';
import { ErrorState, H1, Loading, Screen } from '@/components/UI';
import { getActivity } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { C, R, T } from '@/lib/tokens';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WINDOW = 7;

interface Day {
  label: string;
  hit: boolean;
}

/**
 * 45 · Streak.
 *
 * There is no streak in the loyalty engine, so rather than invent a number this
 * shows what the data actually supports: the days in the last week on which you
 * earned something, and the run of consecutive days ending today. If a real
 * streak feature arrives later, this screen is where it lands.
 */
export default function Streak() {
  const router = useRouter();

  const state = useAsync(async () => {
    const events = await getActivity(120);

    // Local midnights, so "today" means the customer's today.
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const earned = new Set<number>();
    for (const e of events) {
      if (e.type !== 'earn') continue;
      const at = new Date(e.at);
      if (Number.isNaN(at.getTime())) continue;
      earned.add(startOfDay(at));
    }

    const days: Day[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = new Date(today - i * 86_400_000);
      days.push({ label: DAY_LABELS[d.getDay()]!, hit: earned.has(startOfDay(d)) });
    }

    // Consecutive days ending today (or yesterday, so an evening visit still counts).
    let run = 0;
    for (let i = 0; ; i++) {
      if (!earned.has(today - i * 86_400_000)) {
        if (i === 0) continue; // today isn't over yet
        break;
      }
      run++;
      if (i > 400) break;
    }

    return { days, run, visits: earned.size };
  }, []);

  useEffect(() => {
    if (state.signedOut) router.replace('/onboarding/phone');
  }, [state.signedOut, router]);

  const days = state.data?.days ?? [];
  const run = state.data?.run ?? 0;

  const headline =
    run >= 2 ? `${run} days in a row` : run === 1 ? 'You visited today' : 'No visits yet this week';

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <BackBar fallback="/home" />

      <View style={{ marginTop: 20 }}>
        <H1>Streak</H1>
        <Lede style={{ marginTop: 10 }}>{state.loading ? ' ' : headline}</Lede>
      </View>

      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : (
        <View style={{ marginTop: 32 }}>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {days.map((d, i) => (
              <View
                key={`${d.label}-${i}`}
                style={{ flex: 1, height: 46, borderRadius: R.control, backgroundColor: d.hit ? C.orange : C.wash }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 10 }}>
            {days.map((d, i) => (
              <Text
                key={`${d.label}-label-${i}`}
                style={[T.tiny, { flex: 1, fontSize: 11, lineHeight: 15, textAlign: 'center', color: C.soft }]}
              >
                {d.label}
              </Text>
            ))}
          </View>

          <Lede style={{ marginTop: 32 }}>
            Every purchase you earn on counts as a visit. Show your code at the till to be counted.
          </Lede>
        </View>
      )}
    </Screen>
  );
}
