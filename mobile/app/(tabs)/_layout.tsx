// 底部 Tab 导航：今日 / 素材库 / 设置

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontSize: 18, fontWeight: '600' },
      }}
    >
    <Tabs.Screen
      name="today"
      options={{
        title: '今日',
        tabBarLabel: '今日',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="today" size={26} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="library"
      options={{
        title: '素材库',
        tabBarLabel: '素材库',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="library-music" size={26} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="settings"
      options={{
        title: '设置',
        tabBarLabel: '设置',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="settings" size={26} color={color} />
        ),
      }}
    />
    </Tabs>
  );
}
