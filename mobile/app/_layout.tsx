// 根布局：初始化数据库、音频会话、设置 Stack 导航、启动时检查更新

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useDatabase } from '../src/hooks/useDatabase';
import { initAudioSession } from '../src/services/audioSession';
import { useUpdateStore } from '../src/store/updateStore';
import { UpdateModal } from '../src/components/UpdateModal';
import { colors } from '../src/theme';

export default function RootLayout() {
  const { isLoading, error } = useDatabase();
  const { updateInfo, dismiss, checkAuto, autoChecked } = useUpdateStore();

  // 初始化音频会话
  useEffect(() => {
    initAudioSession().catch(() => {
      // 忽略初始化失败（如模拟器不支持）
    });
  }, []);

  // 启动后延迟检查更新
  useEffect(() => {
    if (!autoChecked) {
      const timer = setTimeout(() => checkAuto(), 2000);
      return () => clearTimeout(timer);
    }
  }, [autoChecked, checkAuto]);

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
        {/* 全局更新弹窗 */}
        <UpdateModal info={updateInfo} onClose={dismiss} />
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
