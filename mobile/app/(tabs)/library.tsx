// 素材库：本地项目列表、导入入口、删除素材

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../../src/db/client';
import { getAllProjects, getSegmentsByProject, deleteProject } from '../../src/db/repositories';
import { deleteMediaFile } from '../../src/services/mediaManager';
import type { MediaProject } from '../../src/db/types';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../src/theme';

export default function LibraryScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    const db = await getDatabase();
    const list = await getAllProjects(db);
    setProjects(list);

    const counts: Record<string, number> = {};
    await Promise.all(
      list.map(async (p) => {
        const segs = await getSegmentsByProject(db, p.id);
        counts[p.id] = segs.length;
      }),
    );
    setSegmentCounts(counts);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, [loadProjects]);

  const handleDelete = useCallback(
    (project: MediaProject) => {
      Alert.alert(
        '删除素材',
        `确定要删除「${project.title}」吗？\n\n关联的字幕、切片、练习记录和录音将一并删除，此操作不可撤销。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              const db = await getDatabase();
              // 删除媒体文件
              try {
                deleteMediaFile(project.local_uri);
              } catch {
                // 文件删除失败不阻塞流程
              }
              // 级联删除 DB 记录（含录音文件）
              await deleteProject(db, project.id);
              await loadProjects();
            },
          },
        ],
      );
    },
    [loadProjects],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {/* 导入按钮 */}
            <Pressable
              style={styles.importButton}
              onPress={() => router.push('/import')}
            >
              <Text style={styles.importText}>+ 导入新素材</Text>
            </Pressable>

            {/* 区域标题 */}
            <Text style={styles.sectionTitle}>
              素材项目 {projects.length > 0 && <Text style={styles.countBadge}>{projects.length}</Text>}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={styles.emptyText}>还没有导入任何素材</Text>
            <Text style={styles.emptyHint}>
              支持导入 MP4、MP3/M4A{'\n'}与 SRT/VTT 字幕文件
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.projectCard}
            onPress={() => router.push(`/project/${item.id}`)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={[
              styles.projectIcon,
              { backgroundColor: item.source_type === 'video' ? colors.primaryBg : colors.warning + '20' },
            ]}>
              <Text style={[
                styles.projectIconText,
                { color: item.source_type === 'video' ? colors.primary : colors.warning },
              ]}>
                {item.source_type === 'video' ? '▶' : '♫'}
              </Text>
            </View>
            <View style={styles.projectInfo}>
              <Text style={styles.projectTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.projectMeta}>
                {formatDuration(item.duration_ms)} · {segmentCounts[item.id] ?? 0} 切片 ·{' '}
                {new Date(item.created_at).toLocaleDateString('zh-CN')}
              </Text>
            </View>
            <Pressable
              style={styles.deleteBtn}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
            >
              <Text style={styles.deleteIcon}>✕</Text>
            </Pressable>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />
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
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg,
  },
  // 导入按钮
  importButton: {
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  importText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  // 区域标题
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  countBadge: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontWeight: fontWeights.regular,
  },
  // 空状态
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSizes.lg,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  emptyHint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  // 项目卡片
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectIconText: {
    fontSize: 20,
  },
  projectInfo: {
    flex: 1,
  },
  projectTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  projectMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  deleteIcon: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
  },
});
