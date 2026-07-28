import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';

/** The 5 main tabs. Order here matches the floating TabBar's layout
 *  (home · discover · [raised scan] · activity · profile). */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
