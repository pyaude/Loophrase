// 导入页：文件选择 → 授权确认 → 提取时长 → 完成导入

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { colors, spacing, fontSizes, radius } from '../src/theme';
import { pickFiles, performImport, type PickedFiles } from '../src/services/importService';

type Step = 'idle' | 'picked' | 'confirming' | 'importing' | 'done';

export default function ImportScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [files, setFiles] = useState<PickedFiles | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [authorized, setAuthorized] = useState(false);

  // 用隐藏 VideoView 提取时长
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEventListener(player, 'sourceLoad', (event) => {
    if (event.duration > 0) {
      setDurationMs(Math.round(event.duration * 1000));
      setStep('confirming');
    }
  });

  // 选择文件
  const handlePick = useCallback(async () => {
    setStep('importing');
    const picked = await pickFiles();
    if (!picked) {
      router.back();
      return;
    }
    setFiles(picked);
    // 用播放器加载以获取时长
    player.replace(picked.mediaAsset.uri);
  }, [player, router]);

  useEffect(() => {
    if (step === 'idle') {
      handlePick();
    }
  }, [step, handlePick]);

  // 执行导入
  const handleImport = useCallback(async () => {
    if (!files || !authorized) return;
    setStep('importing');

    try {
      const result = await performImport(files, durationMs);
      const subtitleMsg = result.segmentCount > 0
        ? `已创建项目「${result.project.title}」，生成 ${result.segmentCount} 个练习切片`
        : `已创建项目「${result.project.title}」。未导入字幕，你可以在项目详情页后续添加字幕`;
      Alert.alert('导入成功', subtitleMsg, [
        { text: '好的', onPress: () => router.replace(`/project/${result.project.id}`) },
      ]);
    } catch (err) {
      Alert.alert('导入失败', String(err), [
        { text: '返回', onPress: () => router.back() },
      ]);
    }
  }, [files, authorized, durationMs, router]);

  const mediaName = files?.mediaAsset.name ?? '';
  const subtitleName = files?.subtitleAsset?.name;

  return (
    <View style={styles.container}>
      {/* 隐藏的 VideoView，仅用于提取时长 */}
      <View style={{ width: 1, height: 1, opacity: 0 }}>
        <VideoView
          player={player}
          style={{ width: 1, height: 1 }}
          nativeControls={false}
          contentFit="contain"
        />
      </View>

      {step === 'importing' && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>正在处理...</Text>
        </View>
      )}

      {step === 'confirming' && (
        <View style={styles.confirmContainer}>
          <Text style={styles.title}>确认导入</Text>

          {/* 文件信息 */}
          <View style={styles.infoCard}>
            <InfoRow label="媒体文件" value={mediaName} />
            <InfoRow label="字幕文件" value={subtitleName ?? '（无字幕）'} />
            <InfoRow label="时长" value={formatDuration(durationMs)} />
          </View>

          {/* 授权确认 */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setAuthorized(!authorized)}
          >
            <View style={[styles.checkbox, authorized && styles.checkboxChecked]}>
              {authorized && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              我拥有或获授权使用此素材
            </Text>
          </Pressable>

          <Text style={styles.privacyHint}>
            原视频和录音默认仅保存在本机，不会上传到云端。
          </Text>

          {/* 操作按钮 */}
          <Pressable
            style={[styles.importButton, !authorized && styles.buttonDisabled]}
            disabled={!authorized}
            onPress={handleImport}
          >
            <Text style={styles.buttonText}>开始导入</Text>
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  confirmContainer: {
    flex: 1,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: '500',
    maxWidth: '60%',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: fontSizes.md,
    color: colors.text,
    flexShrink: 1,
  },
  privacyHint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  importButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
  },
});
