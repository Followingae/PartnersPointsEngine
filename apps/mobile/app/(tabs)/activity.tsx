import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Amount, Icon, ListRow, Tile } from '@/components/Bits';
import { H1, IconButton, Label, Screen } from '@/components/UI';
import { R } from '@/lib/tokens';
import { amountColor, grouped } from '@/app/activity/_data';

export default function Activity() {
  const router = useRouter();

  // TODO(api): GET /customer/activity (respecting the filters sheet).
  const groups = grouped();

  return (
    <Screen>
      <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Activity</H1>
        <IconButton onPress={() => router.push('/activity/filters')}>
          <Icon name="filter" size={18} />
        </IconButton>
      </View>

      {groups.map((g, gi) => (
        <View key={g.group} style={{ marginTop: gi === 0 ? 24 : 22 }}>
          <Label>{g.group}</Label>
          {g.items.map((e, i) => (
            <ListRow
              key={e.id}
              divider={i > 0}
              onPress={() => router.push(`/activity/${e.id}`)}
              lead={<Tile size={40} radius={R.small} background={e.tile}>{null}</Tile>}
              title={e.title}
              sub={e.sub}
              trailing={<Amount value={e.amount} color={amountColor(e.kind)} />}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
