// 导入页：表单式选择媒体 + 字幕 → 授权确认 → 完成导入

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { colors, spacing, fontSizes, radius } from '../src/theme';
import {
  pickMediaFile,
  pickSubtitleAsset,
  performImport,
} from '../src/services/importService';

export default function ImportScreen() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [mediaAsset, setMediaAsset] = useState<DocumentPickerAsset | null>(null);
  const [subtitleAsset, setSubtitleAsset] = useState<DocumentPickerAsset | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [parsingDuration, setParsingDuration] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  // 隐藏播放器，仅用于后台提取时长
  const player = useVideoPlayer(null);

  // 监听播放器状态变化，提取时长
  useEventListener(player, 'statusChange', (status) => {
    if (status.status === 'readyToPlay') {
      const dur = player.duration;
      if (dur > 0) {
        setDurationMs(Math.round(dur * 1000));
      }
      setParsingDuration(false);
    } else if (status.status === 'error') {
      setParsingDuration(false);
    }
  });

  // 选择媒体文件
  const handlePickMedia = useCallback(async () => {
    const asset = await pickMediaFile();
    if (!asset) return;
    setMediaAsset(asset);
    setDurationMs(0);
    setParsingDuration(true);
    try {
      player.replace(asset.uri);
      // 5 秒超时保护
      setTimeout(() => setParsingDuration(false), 5000);
    } catch {
      setParsingDuration(false);
    }
  }, [player]);

  // 选择字幕文件
  const handlePickSubtitle = useCallback(async () => {
    try {
      const asset = await pickSubtitleAsset();
      if (!asset) return;
      setSubtitleAsset(asset);
    } catch (err) {
      Alert.alert('格式不支持', String(err));
    }
  }, []);

  // 清除字幕
  const handleRemoveSubtitle = useCallback(() => {
    setSubtitleAsset(null);
  }, []);

  // 执行导入
  const handleImport = useCallback(async () => {
    if (!mediaAsset || !authorized) return;
    setImporting(true);

    try {
      const result = await performImport(
        { mediaAsset, subtitleAsset: subtitleAsset ?? undefined },
        durationMs,
      );
      const subtitleMsg = result.segmentCount > 0
        ? `已创建项目「${result.project.title}」，生成 ${result.segmentCount} 个练习切片`
        : `已创建项目「${result.project.title}」。未导入字幕，你可以在项目详情页后续添加字幕`;
      Alert.alert('导入成功', subtitleMsg, [
        { text: '好的', onPress: () => router.replace(`/project/${result.project.id}`) },
      ]);
    } catch (err) {
      setImporting(false);
      Alert.alert('导入失败', String(err));
    }
  }, [mediaAsset, subtitleAsset, authorized, durationMs, router]);

  const canConfirm = mediaAsset !== null;

  if (importing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>正在导入...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 隐藏的 VideoView，仅用于提取时长 */}
      <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}>
        <VideoView
          player={player}
          style={{ width: 1, height: 1 }}
          nativeControls={false}
          contentFit="contain"
        />
      </View>

      <View style={styles.form}>
        <Text style={styles.title}>导入素材</Text>
        <Text style={styles.subtitle}>
          选择视频/音频文件和对应的字幕文件（字幕可选）
        </Text>

        {/* 媒体文件选择 */}
        <Text style={styles.sectionLabel}>媒体文件</Text>
        <Pressable
          style={[styles.filePicker, mediaAsset && styles.filePickerFilled]}
          onPress={handlePickMedia}
        >
          {mediaAsset ? (
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>🎬</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {mediaAsset.name}
                </Text>
                {parsingDuration ? (
                  <Text style={styles.fileHint}>正在解析时长...</Text>
                ) : durationMs > 0 ? (
                  <Text style={styles.fileHint}>
                    时长 {formatDuration(durationMs)} · 点击重新选择
                  </Text>
                ) : (
                  <Text style={styles.fileHint}>点击重新选择</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>🎬</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileName}>选择视频或音频</Text>
                <Text style={styles.fileHint}>支持 MP4 / MP3 / M4A</Text>
              </View>
              <Text style={styles.pickerArrow}>＋</Text>
            </View>
          )}
        </Pressable>

        {/* 字幕文件选择 */}
        <Text style={styles.sectionLabel}>字幕文件（可选）</Text>
        <Pressable
          style={[styles.filePicker, subtitleAsset && styles.filePickerFilled]}
          onPress={handlePickSubtitle}
        >
          {subtitleAsset ? (
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>📄</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {subtitleAsset.name}
                </Text>
                <Text style={styles.fileHint}>点击重新选择</Text>
              </View>
              <Pressable
                style={styles.removeBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  handleRemoveSubtitle();
                }}
              >
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>📄</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileName}>选择字幕文件</Text>
                <Text style={styles.fileHint}>支持 SRT / VTT，可跳过</Text>
              </View>
              <Text style={styles.pickerArrow}>＋</Text>
            </View>
          )}
        </Pressable>

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
          style={[styles.importButton, (!canConfirm || !authorized) && styles.buttonDisabled]}
          disabled={!canConfirm || !authorized}
          onPress={handleImport}
        >
          <Text style={styles.buttonText}>开始导入</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
      </View>
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
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  form: {
    flex: 1,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  filePickerFilled: {
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  fileInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileIcon: {
    fontSize: 28,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: '500',
  },
  fileHint: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pickerArrow: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '300',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
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
