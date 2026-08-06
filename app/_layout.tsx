// 根布局：初始化数据库、音频会话、设置 Stack 导航

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useDatabase } from '../src/hooks/useDatabase';
import { initAudioSession } from '../src/services/audioSession';
import { colors } from '../src/theme';

export default function RootLayout() {
  const { isLoading, error } = useDatabase();

  // 初始化音频会话
  useEffect(() => {
    initAudioSession().catch(() => {
      // 忽略初始化失败（如模拟器不支持）
    });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="import"
            options={{ headerShown: true, title: '导入素材', headerBackTitle: '取消' }}
          />
          <Stack.Screen
            name="review"
            options={{ headerShown: true, title: '复习', headerBackTitle: '退出' }}
          />
          <Stack.Screen
            name="project/[id]"
            options={{ headerShown: true, title: '切片编辑', headerBackTitle: '返回' }}
          />
          <Stack.Screen
            name="player/[id]"
            options={{ headerShown: false, orientation: 'landscape' }}
          />
          <Stack.Screen
            name="subtitle-editor/[id]"
            options={{ headerShown: true, title: '字幕编辑器', headerBackTitle: '返回' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});
