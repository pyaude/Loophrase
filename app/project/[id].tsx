// 项目详情 + 切片编辑器（§7：切片编辑器页面）

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../../src/db/client';
import {
  getProjectById,
  getSegmentsByProject,
  updateSegmentTimes,
  updateSegmentText,
  updateSegmentSkipType,
  mergeSegments,
  reorderSegments,
  createSegment,
  deleteProject,
} from '../../src/db/repositories';
import { deleteMediaFile } from '../../src/services/mediaManager';
import type { MediaProject, Segment, SkipType } from '../../src/db/types';
import { colors, spacing, fontSizes, radius } from '../../src/theme';

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<MediaProject | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    const db = await getDatabase();
    const proj = await getProjectById(db, id);
    const segs = await getSegmentsByProject(db, id);
    setProject(proj);
    setSegments(segs);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // 合并选中的两个相邻切片
  const handleMerge = useCallback(async () => {
    if (selectedIds.size !== 2) return;
    const db = await getDatabase();
    const sorted = segments
      .filter((s) => selectedIds.has(s.id))
      .sort((a, b) => a.order_index - b.order_index);

    if (sorted.length !== 2) return;
    const areAdjacent =
      sorted[1].order_index - sorted[0].order_index === 1;
    if (!areAdjacent) {
      Alert.alert('提示', '只能合并相邻的两个切片');
      return;
    }

    await mergeSegments(db, sorted[0].id, sorted[1].id);
    await reorderSegments(db, id);
    setSelectedIds(new Set());
    await loadData();
  }, [selectedIds, segments, id, loadData]);

  // 拆分：在文本中间位置拆分
  const handleSplit = useCallback(
    async (seg: Segment) => {
      const db = await getDatabase();
      const midMs = Math.round((seg.start_ms + seg.end_ms) / 2);
      const words = seg.text.split(/\s+/);
      const midWord = Math.ceil(words.length / 2);
      const firstText = words.slice(0, midWord).join(' ');
      const secondText = words.slice(midWord).join(' ');

      // 缩短当前切片
      await updateSegmentTimes(db, seg.id, seg.start_ms, midMs);
      await updateSegmentText(db, seg.id, firstText);

      // 创建新切片
      await createSegment(db, {
        projectId: id,
        orderIndex: seg.order_index + 1,
        startMs: midMs,
        endMs: seg.end_ms,
        text: secondText,
        source: 'manual',
        status: 'confirmed',
      });

      await reorderSegments(db, id);
      await loadData();
    },
    [id, loadData],
  );

  // 调整时间边界（±100ms）
  const handleAdjustTime = useCallback(
    async (seg: Segment, field: 'start' | 'end', delta: number) => {
      const db = await getDatabase();
      const newStart = field === 'start' ? seg.start_ms + delta : seg.start_ms;
      const newEnd = field === 'end' ? seg.end_ms + delta : seg.end_ms;
      if (newEnd <= newStart) return;
      await updateSegmentTimes(db, seg.id, newStart, newEnd);
      await loadData();
    },
    [loadData],
  );

  // 标记跳过类型
  const handleToggleSkip = useCallback(
    async (seg: Segment) => {
      const db = await getDatabase();
      const newType: SkipType = seg.skip_type ? null : 'music';
      await updateSegmentSkipType(db, seg.id, newType);
      await loadData();
    },
    [loadData],
  );

  // 保存编辑的文本
  const handleSaveText = useCallback(async () => {
    if (!editingId) return;
    const db = await getDatabase();
    await updateSegmentText(db, editingId, editingText.trim());
    setEditingId(null);
    setEditingText('');
    await loadData();
  }, [editingId, loadData]);

  const toggleSelect = useCallback((segId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(segId)) {
        next.delete(segId);
      } else {
        if (next.size >= 2) {
          // 保留最新的，移除最早的
          const first = next.values().next().value;
          if (first) next.delete(first);
        }
        next.add(segId);
      }
      return next;
    });
  }, []);

  const handleDeleteProject = useCallback(async () => {
    Alert.alert('删除项目', '确定删除此项目及其所有切片？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          if (!project) return;
          const db = await getDatabase();
          await deleteProject(db, project.id);
          deleteMediaFile(project.local_uri);
          router.back();
        },
      },
    ]);
  }, [project, router]);

  if (!project) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {project.title}
          </Text>
          <Text style={styles.projectMeta}>
            {segments.length} 个切片 · {formatMs(project.duration_ms)}
          </Text>
        </View>
        <Pressable style={styles.startButton} onPress={() => router.push(`/player/${project.id}`)}>
          <Text style={styles.startButtonText}>开始练习</Text>
        </Pressable>
      </View>

      {/* 合并操作栏 */}
      {selectedIds.size === 2 && (
        <View style={styles.mergeBar}>
          <Text style={styles.mergeBarText}>已选 2 个切片</Text>
          <Pressable style={styles.mergeButton} onPress={handleMerge}>
            <Text style={styles.mergeButtonText}>合并</Text>
          </Pressable>
          <Pressable onPress={() => setSelectedIds(new Set())}>
            <Text style={styles.cancelSmall}>取消</Text>
          </Pressable>
        </View>
      )}

      {/* 切片列表 */}
      <FlatList
        data={segments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SegmentCard
            segment={item}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
            onSplit={() => handleSplit(item)}
            onAdjustTime={(field, delta) => handleAdjustTime(item, field, delta)}
            onToggleSkip={() => handleToggleSkip(item)}
            isEditing={editingId === item.id}
            editingText={editingText}
            onStartEdit={() => {
              setEditingId(item.id);
              setEditingText(item.text);
            }}
            onCancelEdit={() => {
              setEditingId(null);
              setEditingText('');
            }}
            onSaveEdit={handleSaveText}
            onChangeText={setEditingText}
          />
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />

      <Pressable style={styles.deleteButton} onPress={handleDeleteProject}>
        <Text style={styles.deleteText}>删除项目</Text>
      </Pressable>
    </View>
  );
}

function SegmentCard({
  segment,
  selected,
  onToggleSelect,
  onSplit,
  onAdjustTime,
  onToggleSkip,
  isEditing,
  editingText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeText,
}: {
  segment: Segment;
  selected: boolean;
  onToggleSelect: () => void;
  onSplit: () => void;
  onAdjustTime: (field: 'start' | 'end', delta: number) => void;
  onToggleSkip: () => void;
  isEditing: boolean;
  editingText: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onChangeText: (text: string) => void;
}) {
  return (
    <View
      style={[
        styles.segmentCard,
        selected && styles.segmentSelected,
        segment.skip_type && styles.segmentSkipped,
      ]}
    >
      <View style={styles.segmentHeader}>
        <Pressable style={styles.indexCircle} onPress={onToggleSelect}>
          <Text style={styles.indexText}>{segment.order_index + 1}</Text>
        </Pressable>

        <Text style={styles.timeText}>
          {formatMs(segment.start_ms)} → {formatMs(segment.end_ms)}
          <Text style={styles.durationText}>
            {' '}({formatMs(segment.end_ms - segment.start_ms)})
          </Text>
        </Text>

        {segment.skip_type ? (
          <View style={styles.skipBadge}>
            <Text style={styles.skipText}>{segment.skip_type === 'music' ? '音乐' : segment.skip_type}</Text>
          </View>
        ) : null}
      </View>

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
            <Pressable style={styles.smallButton} onPress={onCancelEdit}>
              <Text style={styles.smallButtonText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.smallButton, styles.smallButtonPrimary]} onPress={onSaveEdit}>
              <Text style={styles.smallButtonTextPrimary}>保存</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={onStartEdit}>
          <Text style={styles.segmentText}>{segment.text}</Text>
        </Pressable>
      )}

      {/* 操作按钮 */}
      {!isEditing && (
        <View style={styles.actionsRow}>
          {/* 时间微调 */}
          <View style={styles.timeAdjustGroup}>
            <Text style={styles.timeAdjustLabel}>起:</Text>
            <Pressable style={styles.timeBtn} onPress={() => onAdjustTime('start', -100)}>
              <Text style={styles.timeBtnText}>-0.1s</Text>
            </Pressable>
            <Pressable style={styles.timeBtn} onPress={() => onAdjustTime('start', 100)}>
              <Text style={styles.timeBtnText}>+0.1s</Text>
            </Pressable>
          </View>
          <View style={styles.timeAdjustGroup}>
            <Text style={styles.timeAdjustLabel}>止:</Text>
            <Pressable style={styles.timeBtn} onPress={() => onAdjustTime('end', -100)}>
              <Text style={styles.timeBtnText}>-0.1s</Text>
            </Pressable>
            <Pressable style={styles.timeBtn} onPress={() => onAdjustTime('end', 100)}>
              <Text style={styles.timeBtnText}>+0.1s</Text>
            </Pressable>
          </View>
          <Pressable style={styles.actionBtn} onPress={onSplit}>
            <Text style={styles.actionBtnText}>拆分</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, segment.skip_type && styles.actionBtnActive]}
            onPress={onToggleSkip}
          >
            <Text style={styles.actionBtnText}>
              {segment.skip_type ? '保留' : '标记跳过'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const decisec = Math.floor((ms % 1000) / 100);
  return `${min}:${sec.toString().padStart(2, '0')}.${decisec}`;
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
  projectTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  projectMeta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  startButtonText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  mergeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  mergeBarText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  mergeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  mergeButtonText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  cancelSmall: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  segmentCard: {
    margin: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  segmentSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  segmentSkipped: {
    opacity: 0.5,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  indexCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '700',
  },
  timeText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  durationText: {
    color: colors.primary,
    fontWeight: '500',
  },
  skipBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  skipText: {
    color: colors.textInverse,
    fontSize: fontSizes.xs,
  },
  segmentText: {
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
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
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: {
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  smallButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  smallButtonTextPrimary: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  timeAdjustGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  timeAdjustLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  timeBtn: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeBtnText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  actionBtnText: {
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  deleteButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  deleteText: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
});
