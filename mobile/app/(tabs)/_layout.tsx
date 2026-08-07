// 底部 Tab 导航：今日 / 素材库 / 设置

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, shadows } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        headerStyle: {
          backgroundColor: colors.bg,
          shadowColor: 'transparent',
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 0,
        },
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.text,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.bgWhite,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: 56,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -4,
        },
        tabBarIconStyle: {
          marginTop: 6,
        },
      }}
    >
    <Tabs.Screen
      name="today"
      options={{
        title: '今日',
        tabBarLabel: '今日',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="today" size={24} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="library"
      options={{
        title: '素材库',
        tabBarLabel: '素材库',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="library-music" size={24} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="settings"
      options={{
        title: '设置',
        tabBarLabel: '设置',
        tabBarIcon: ({ color }) => (
          <MaterialIcons name="settings" size={24} color={color} />
        ),
      }}
    />
    </Tabs>
  );
}
