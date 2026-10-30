import { Tabs } from 'expo-router';

import { colors } from '@/theme/colors';

const tabs = [
  ['index', 'Discover'],
  ['bakeries', 'Bakeries'],
  ['explore', 'Explore'],
  ['leaderboard', 'Leaderboard'],
  ['profile', 'Profile'],
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.parchment },
        headerTitleStyle: { color: colors.espresso },
        tabBarActiveTintColor: colors.caramel,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.creamWhite, borderTopColor: colors.border },
      }}
    >
      {tabs.map(([name, title]) => (
        <Tabs.Screen key={name} name={name} options={{ title }} />
      ))}
    </Tabs>
  );
}
