// 设置页：播放偏好、隐私、云同步、关于、检查更新

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import * as Application from 'expo-application';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../src/theme';
import { isSyncAvailable, syncToCloud } from '../../src/services/sync';
import { trackEvent } from '../../src/services/analytics';
import { useUpdateStore } from '../../src/store/updateStore';

export default function SettingsScreen() {
  const [autoSkipNonSpeech, setAutoSkipNonSpeech] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncOn = isSyncAvailable();

  const appVersion = Application.nativeApplicationVersion ?? '0.0.0';
  const { checkManually, checking: checkingUpdate } = useUpdateStore();

  const handleSync = useCallback(async () => {
    setSyncing(true);
    trackEvent('sync_started');
    const result = await syncToCloud();
    setSyncing(false);

    if (result.errors.length > 0) {
      Alert.alert('同步失败', result.errors.join('\n'));
      trackEvent('sync_failed');
    } else {
      Alert.alert('同步成功', `已同步 ${result.synced} 条记录`);
    }
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    try {
      const result = await checkManually();
      if (!result || !result.has_update) {
        Alert.alert('已是最新版本', `当前版本 v${appVersion}`);
      }
      // 有更新时，UpdateModal 会由全局 store 驱动弹出
    } catch {
      Alert.alert('检查失败', '无法连接到更新服务器，请稍后重试');
    }
  }, [appVersion, checkManually]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      {/* 播放设置 */}
      <Text style={styles.sectionLabel}>播放设置</Text>
      <View style={styles.group}>
        <SettingRow label="单句循环缓冲" value="前 0.2s / 后 0.4s" />
        <SettingRow label="默认播放速度" value="1.0x" />
        <SettingRow label="跟读留白时长" value="原句时长" />
        <SwitchRow
          label="自动跳过非对白"
          value={autoSkipNonSpeech}
          onValueChange={setAutoSkipNonSpeech}
        />
      </View>

      {/* 复习设置 */}
      <Text style={styles.sectionLabel}>复习设置</Text>
      <View style={styles.group}>
        <SettingRow label="每日新增上限" value="5 句" />
        <SettingRow label="复习间隔" value="1 / 3 / 7 / 14 / 30 天" />
      </View>

      {/* 云同步 */}
      <Text style={styles.sectionLabel}>云同步</Text>
      <View style={styles.group}>
        <SettingRow
          label="同步状态"
          value={syncOn ? '已登录' : '未配置'}
        />
        {syncOn && (
          <Pressable
            style={styles.actionRow}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <View style={styles.actionRowContent}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                  同步中...
                </Text>
              </View>
            ) : (
              <Text style={styles.actionText}>立即同步</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* 隐私 */}
      <Text style={styles.sectionLabel}>隐私与数据</Text>
      <View style={styles.group}>
        <SettingRow label="原视频存储位置" value="仅本地" />
        <SettingRow label="云端转写授权" value="未启用" />
        <SettingRow label="录音备份" value="仅本地" />
        <SettingRow label="转写音轨自动删除" value="24 小时" />
        <SettingRow label="删除云端数据" value="" />
      </View>

      {/* 关于 */}
      <Text style={styles.sectionLabel}>关于</Text>
      <View style={styles.group}>
        <SettingRow label="版本" value={`v${appVersion}`} />
        <SettingRow label="学习方法" value="100LS 精练法" />
        <Pressable
          style={styles.actionRow}
          onPress={handleCheckUpdate}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <View style={styles.actionRowContent}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                检查中...
              </Text>
            </View>
          ) : (
            <Text style={styles.actionText}>检查更新</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      {value ? <Text style={styles.settingValue}>{value}</Text> : null}
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  group: {
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  settingLabel: {
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  settingValue: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  actionRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  actionRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
