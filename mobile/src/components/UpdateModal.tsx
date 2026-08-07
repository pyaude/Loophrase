// 更新提示弹窗组件（§U2-4/5/6/7）

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSizes, radius } from '../theme';
import { downloadAndInstall, type UpdateCheckResult } from '../services/update';

interface UpdateModalProps {
  /** 更新信息 */
  info: UpdateCheckResult | null;
  /** 关闭弹窗（强制更新时无效） */
  onClose: () => void;
}

type Phase = 'confirm' | 'downloading' | 'error';

export function UpdateModal({ info, onClose }: UpdateModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const isForceUpdate = info?.is_force_update ?? false;

  const handleUpdate = useCallback(async () => {
    if (!info?.download_url) return;
    setPhase('downloading');
    setProgress(0);
    setErrorMsg('');

    try {
      await downloadAndInstall(info.download_url, (p) => {
        setProgress(p);
      });
      // 安装器唤起后不会返回，若返回说明安装未完成
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '下载失败，请重试');
      setPhase('error');
    }
  }, [info?.download_url]);

  const handleRetry = useCallback(() => {
    setPhase('confirm');
    setErrorMsg('');
  }, []);

  // 无更新信息时不渲染
  if (!info) return null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={isForceUpdate ? undefined : onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modal,
            isForceUpdate && styles.modalForce,
          ]}
        >
          {/* 标题 */}
          <Text style={styles.title}>
            {isForceUpdate ? '⚠️ 需要更新' : '📦 发现新版本'}
          </Text>

          {/* 版本号 */}
          <Text style={styles.version}>
            v{info.latest_version}
          </Text>

          {/* 更新日志 */}
          {info.changelog ? (
            <Text style={styles.changelog}>{info.changelog}</Text>
          ) : null}

          {/* 下载进度 */}
          {phase === 'downloading' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          )}

          {/* 错误状态 */}
          {phase === 'error' && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <Pressable style={styles.retryBtn} onPress={handleRetry}>
                <Text style={styles.retryBtnText}>重试</Text>
              </Pressable>
            </View>
          )}

          {/* 文件大小信息 */}
          {phase === 'confirm' && info.file_size ? (
            <Text style={styles.fileSize}>
              大小: {formatFileSize(info.file_size)}
            </Text>
          ) : null}

          {/* 按钮 */}
          {phase === 'confirm' && (
            <View style={styles.buttonRow}>
              {!isForceUpdate && (
                <Pressable style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>稍后</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.updateBtn, isForceUpdate && styles.updateBtnForce]}
                onPress={handleUpdate}
              >
                <Text style={styles.updateBtnText}>立即更新</Text>
              </Pressable>
            </View>
          )}

          {/* 强制更新提示 */}
          {isForceUpdate && phase === 'confirm' && (
            <Text style={styles.forceHint}>
              当前版本过低，需要更新才能继续使用
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalForce: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  version: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  changelog: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  fileSize: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  progressContainer: {
    marginVertical: spacing.md,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  progressText: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: '600',
  },
  errorContainer: {
    marginVertical: spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgSecondary,
  },
  retryBtnText: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  updateBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  updateBtnForce: {
    flex: 1,
  },
  updateBtnText: {
    fontSize: fontSizes.md,
    color: colors.textInverse,
    fontWeight: '600',
  },
  forceHint: {
    fontSize: fontSizes.xs,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
