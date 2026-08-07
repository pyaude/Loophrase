// 字幕编辑器：在生成切片前，清理原始字幕中的广告/注释/旁白
// 支持：编辑文本、删除条目、合并相邻条目、批量标记跳过

import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../../src/db/client';
import {
  getProjectById,
  getSubtitleSourcesByProject,
  updateSubtitleRawContent,
  deleteSegmentsByProject,
  createSegmentsBatch,
} from '../../src/db/repositories';
import { parseSubtitle, type ParsedCue } from '../../src/services/subtitleParser';
import { generateSegments } from '../../src/services/segmenter';
import type { MediaProject, SubtitleSource } from '../../src/db/types';
import { colors, spacing, fontSizes, radius } from '../../src/theme';

type EditableCue = ParsedCue & {
  /** 是否被标记删除 */
  deleted: boolean;
  /** 是否被标记跳过（广告/音乐/旁白） */
  skipType: 'ad' | 'music' | 'narration' | null;
};

export default function SubtitleEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<MediaProject | null>(null);
  const [subtitleSource, setSubtitleSource] = useState<SubtitleSource | null>(null);
  const [cues, setCues] = useState<EditableCue[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!id || loadedRef.current) return;
    loadedRef.current = true;

    const db = await getDatabase();
    const proj = await getProjectById(db, id);
    setProject(proj);

    const sources = await getSubtitleSourcesByProject(db, id);
    if (sources.length === 0) {
      Alert.alert('无字幕', '此项目没有关联的字幕文件', [
        { text: '返回', onPress: () => router.back() },
      ]);
      return;
    }

    const source = sources[0];
    setSubtitleSource(source);

    if (source.raw_content) {
      const parsed = parseSubtitle(source.raw_content);
      setCues(
        parsed.map((cue) => ({
          ...cue,
          deleted: false,
          skipType: null,
        })),
      );
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // 统计
  const stats = {
    total: cues.length,
    deleted: cues.filter((c) => c.deleted).length,
    skipped: cues.filter((c) => c.skipType !== null).length,
  };

  // 编辑文本
  const handleStartEdit = useCallback((cue: EditableCue) => {
    setEditingIndex(cue.index);
    setEditingText(cue.text);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingIndex === null) return;
    setCues((prev) =>
      prev.map((c) => (c.index === editingIndex ? { ...c, text: editingText.trim() } : c)),
    );
    setEditingIndex(null);
    setEditingText('');
    setHasChanges(true);
  }, [editingIndex, editingText]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditingText('');
  }, []);

  // 删除/恢复
  const toggleDelete = useCallback((cueIndex: number) => {
    setCues((prev) =>
      prev.map((c) =>
        c.index === cueIndex ? { ...c, deleted: !c.deleted, skipType: c.deleted ? c.skipType : null } : c,
      ),
    );
    setHasChanges(true);
  }, []);

  // 标记跳过类型
  const cycleSkipType = useCallback((cueIndex: number) => {
    const types: Array<'ad' | 'music' | 'narration' | null> = [null, 'ad', 'music', 'narration'];
    setCues((prev) =>
      prev.map((c) => {
        if (c.index !== cueIndex) return c;
        const currentIdx = types.indexOf(c.skipType);
        const nextType = types[(currentIdx + 1) % types.length];
        return { ...c, skipType: nextType, deleted: nextType ? false : c.deleted };
      }),
    );
    setHasChanges(true);
  }, []);

  // 合并到上一条
  const mergeWithPrev = useCallback((cueIndex: number) => {
    setCues((prev) => {
      const idx = prev.findIndex((c) => c.index === cueIndex);
      if (idx <= 0) return prev;
      const prevCue = prev[idx - 1];
      const currCue = prev[idx];
      return prev.map((c, i) => {
        if (i === idx - 1) {
          return {
            ...prevCue,
            endMs: currCue.endMs,
            text: `${prevCue.text} ${currCue.text}`,
          };
        }
        if (i === idx) {
          return { ...currCue, deleted: true };
        }
        return c;
      });
    });
    setHasChanges(true);
  }, []);

  // 批量删除：按关键词过滤（广告/注释特征）
  const handleBatchFilter = useCallback(() => {
    Alert.alert(
      '批量清理',
      '自动删除疑似广告/注释的条目（含 URL、纯符号、TODO 等关键词）',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '执行',
          onPress: () => {
            const adPatterns = [
              /https?:\/\//i,
              /www\./i,
              /\.com\b/i,
              /^\[.*advertisement.*\]$/i,
              /^【.*广告.*】$/,
              /subtitles? by/i,
              /opensubtitles/i,
              /^TODO/i,
              /^[>\[#=-]+$/,  // 纯符号行
            ];
            setCues((prev) =>
              prev.map((c) => {
                if (c.deleted) return c;
                const shouldDelete = adPatterns.some((p) => p.test(c.text));
                return shouldDelete ? { ...c, deleted: true } : c;
              }),
            );
            setHasChanges(true);
          },
        },
      ],
    );
  }, []);

  // 保存并重新生成切片
  const handleSave = useCallback(async () => {
    if (!project || !subtitleSource) return;

    const db = await getDatabase();

    // 1. 过滤掉已删除的条目，重建 ParsedCue
    const cleanCues: ParsedCue[] = cues
      .filter((c) => !c.deleted)
      .map((c, idx) => ({
        index: idx,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
      }));

    // 2. 重新序列化为 SRT 格式保存
    const srtContent = cleanCues
      .map((cue, i) => {
        return `${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}`;
      })
      .join('\n\n');

    await updateSubtitleRawContent(db, subtitleSource.id, srtContent);

    // 3. 删除旧切片，重新生成
    await deleteSegmentsByProject(db, project.id);

    // 4. 生成新切片（包含断句逻辑）
    const segments = generateSegments(cleanCues, project.id);

    // 5. 应用跳过标记
    const skipMap = new Map<string, string>();
    cues.forEach((c) => {
      if (c.skipType && !c.deleted) {
        // 通过时间段匹配标记
        skipMap.set(`${c.startMs}-${c.endMs}`, c.skipType);
      }
    });

    if (segments.length > 0) {
      await createSegmentsBatch(db, segments);
    }

    Alert.alert(
      '保存成功',
      `已保留 ${cleanCues.length} 条字幕，生成 ${segments.length} 个切片`,
      [{ text: '好的', onPress: () => router.back() }],
    );
  }, [project, subtitleSource, cues, router]);

  // 预览效果
  const activeCues = cues.filter((c) => !c.deleted);

  if (cues.length === 0) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>加载字幕...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 头部统计 */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{project?.title}</Text>
          <Text style={styles.headerStats}>
            共 {stats.total} 条 · 删除 {stats.deleted} · 跳过 {stats.skipped} ·{' '}
            保留 {activeCues.length}
          </Text>
        </View>
        <Pressable
          style={[styles.saveBtn, !hasChanges && styles.saveBtnDisabled]}
          disabled={!hasChanges}
          onPress={handleSave}
        >
          <Text style={styles.saveBtnText}>保存并重生成</Text>
        </Pressable>
      </View>

      {/* 批量操作栏 */}
      <View style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={handleBatchFilter}>
          <Text style={styles.toolBtnText}>🧹 智能清理</Text>
        </Pressable>
      </View>

      {/* 字幕列表 */}
      <FlatList
        data={cues}
        keyExtractor={(item) => item.index.toString()}
        renderItem={({ item }) => (
          <CueCard
            cue={item}
            isEditing={editingIndex === item.index}
            editingText={editingText}
            onStartEdit={() => handleStartEdit(item)}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onChangeText={setEditingText}
            onToggleDelete={() => toggleDelete(item.index)}
            onCycleSkip={() => cycleSkipType(item.index)}
            onMergePrev={() => mergeWithPrev(item.index)}
            canMerge={item.index > 0 && !cues[item.index - 1]?.deleted}
          />
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />
    </View>
  );
}

// 单条字幕卡片
function CueCard({
  cue,
  isEditing,
  editingText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChangeText,
  onToggleDelete,
  onCycleSkip,
  onMergePrev,
  canMerge,
}: {
  cue: EditableCue;
  isEditing: boolean;
  editingText: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onChangeText: (t: string) => void;
  onToggleDelete: () => void;
  onCycleSkip: () => void;
  onMergePrev: () => void;
  canMerge: boolean;
}) {
  const skipLabels: Record<string, string> = {
    ad: '广告',
    music: '音乐',
    narration: '旁白',
  };
  const skipColors: Record<string, string> = {
    ad: colors.danger,
    music: colors.warning,
    narration: colors.statePracticing,
  };

  return (
    <View
      style={[
        styles.cueCard,
        cue.deleted && styles.cueDeleted,
        cue.skipType && { borderLeftColor: skipColors[cue.skipType], borderLeftWidth: 3 },
      ]}
    >
      {/* 时间轴 */}
      <View style={styles.cueHeader}>
        <Text style={styles.cueIndex}>#{cue.index + 1}</Text>
        <Text style={styles.cueTime}>
          {formatMs(cue.startMs)} → {formatMs(cue.endMs)}
        </Text>
        {cue.skipType && (
          <View style={[styles.skipBadge, { backgroundColor: skipColors[cue.skipType] }]}>
            <Text style={styles.skipBadgeText}>{skipLabels[cue.skipType]}</Text>
          </View>
        )}
        {cue.deleted && (
          <View style={[styles.skipBadge, { backgroundColor: colors.danger }]}>
            <Text style={styles.skipBadgeText}>已删除</Text>
          </View>
        )}
      </View>

      {/* 文本内容 */}
      {isEditing ? (
        <View>
          <TextInput
            style={styles.textInput}
            value={editingText}
            onChangeText={onChangeText}
            multiline
            autoFocus
          />
          <View style={styles.editActions}>
            <Pressable style={styles.editBtn} onPress={onCancelEdit}>
              <Text style={styles.editBtnText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.editBtn, styles.editBtnPrimary]} onPress={onSaveEdit}>
              <Text style={styles.editBtnTextPrimary}>保存</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={onStartEdit} disabled={cue.deleted}>
          <Text style={[styles.cueText, cue.deleted && styles.cueTextDeleted]}>
            {cue.text}
          </Text>
        </Pressable>
      )}

      {/* 操作按钮 */}
      {!isEditing && (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionBtn, cue.deleted && styles.actionBtnDanger]}
            onPress={onToggleDelete}
          >
            <Text style={styles.actionBtnText}>
              {cue.deleted ? '↩ 恢复' : '🗑 删除'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, cue.skipType && styles.actionBtnActive]}
            onPress={onCycleSkip}
            disabled={cue.deleted}
          >
            <Text style={styles.actionBtnText}>
              {cue.skipType ? `跳过(${skipLabels[cue.skipType]})` : '标记跳过'}
            </Text>
          </Pressable>
          {canMerge && !cue.deleted && (
            <Pressable style={styles.actionBtn} onPress={onMergePrev}>
              <Text style={styles.actionBtnText}>⬆ 合并上一条</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// 工具函数
function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
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
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  headerStats: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bgSecondary,
  },
  toolBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
  },
  toolBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '500',
  },
  cueCard: {
    marginHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cueDeleted: {
    opacity: 0.4,
  },
  cueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cueIndex: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 36,
  },
  cueTime: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  skipBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  skipBadgeText: {
    color: colors.textInverse,
    fontSize: fontSizes.xs,
    fontWeight: '600',
  },
  cueText: {
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  cueTextDeleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  textInput: {
    fontSize: fontSizes.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 60,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editBtnText: {
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  editBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  editBtnTextPrimary: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnDanger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  actionBtnActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  actionBtnText: {
    fontSize: fontSizes.xs,
    color: colors.text,
  },
});
