// 设置页：播放偏好、隐私、关于

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, fontSizes, radius } from '../../src/theme';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {/* 播放设置 */}
      <Text style={styles.sectionTitle}>播放设置</Text>
      <View style={styles.group}>
        <SettingRow label="单句循环缓冲" value="前 0.2s / 后 0.4s" />
        <SettingRow label="默认播放速度" value="1.0x" />
        <SettingRow label="跟读留白时长" value="原句时长" />
      </View>

      {/* 复习设置 */}
      <Text style={styles.sectionTitle}>复习设置</Text>
      <View style={styles.group}>
        <SettingRow label="每日新增上限" value="5 句" />
        <SettingRow label="复习间隔" value="1 / 3 / 7 / 14 / 30 天" />
      </View>

      {/* 隐私 */}
      <Text style={styles.sectionTitle}>隐私与数据</Text>
      <View style={styles.group}>
        <SettingRow label="原视频存储位置" value="仅本地" />
        <SettingRow label="云端转写授权" value="未启用" />
        <SettingRow label="录音备份" value="仅本地" />
        <SettingRow label="删除云端数据" value="" />
      </View>

      {/* 关于 */}
      <Text style={styles.sectionTitle}>关于</Text>
      <View style={styles.group}>
        <SettingRow label="版本" value="0.1.0 (MVP)" />
        <SettingRow label="学习方法" value="100LS 精练法" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingLabel: {
    fontSize: fontSizes.md,
    color: colors.text,
  },
  settingValue: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
});
