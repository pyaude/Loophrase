// 今日页：到期复习、今日新增、有效练习与无字幕听懂率

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../../src/db/client';
import { getDueSegments, getReviewStats } from '../../src/db/repositories';
import { getEffectivePracticeDurationMs } from '../../src/db/repositories';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../src/theme';

type DueItem = {
  segment_id: string;
  project_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
};

type Stats = {
  dueCount: number;
  newCount: number;
  practicingCount: number;
  masteredCount: number;
};

export default function TodayScreen() {
  const router = useRouter();
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [practiceMs, setPracticeMs] = useState(0);
  const [understoodRate, setUnderstoodRate] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const db = await getDatabase();
    const startOfToday = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const [due, reviewStats, effectiveMs] = await Promise.all([
      getDueSegments(db),
      getReviewStats(db),
      getEffectivePracticeDurationMs(db, startOfToday),
    ]);

    // 计算无字幕听懂率：今日盲听中标记"已掌握"的比例
    const todayAttempts = await db.getAllAsync<{
      mode: string;
      result: string | null;
    }>(
      `SELECT mode, result FROM practice_attempt
       WHERE created_at >= ? AND mode = 'blind_listen' AND result IS NOT NULL`,
      startOfToday,
    );

    if (todayAttempts.length > 0) {
      const masteredCount = todayAttempts.filter(
        (a) => a.result === 'mastered',
      ).length;
      setUnderstoodRate(Math.round((masteredCount / todayAttempts.length) * 100));
    } else {
      setUnderstoodRate(null);
    }

    setDueItems(due);
    setStats(reviewStats);
    setPracticeMs(effectiveMs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const practiceMin = Math.round(practiceMs / 60000);
  const dueCount = stats?.dueCount ?? 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={dueItems}
        keyExtractor={(item) => item.segment_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {/* 统计卡片行 */}
            <View style={styles.statsRow}>
              <StatCard
                label="待复习"
                value={stats?.dueCount ?? 0}
                color={colors.stateDue}
              />
              <StatCard
                label="练习中"
                value={stats?.practicingCount ?? 0}
                color={colors.statePracticing}
              />
              <StatCard
                label="已掌握"
                value={stats?.masteredCount ?? 0}
                color={colors.stateMastered}
              />
            </View>

            {/* 今日数据横幅 */}
            <View style={styles.practiceBanner}>
              <View style={styles.practiceItem}>
                <Text style={styles.practiceLabel}>今日有效练习</Text>
                <Text style={styles.practiceValue}>{practiceMin} 分钟</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.practiceItem}>
                <Text style={styles.practiceLabel}>无字幕听懂率</Text>
                <Text style={styles.practiceValue}>
                  {understoodRate !== null ? `${understoodRate}%` : '—'}
                </Text>
              </View>
            </View>

            {/* 开始复习 CTA */}
            {dueCount > 0 && (
              <Pressable
                style={styles.reviewStartBtn}
                onPress={() => router.push('/review')}
              >
                <Text style={styles.reviewStartText}>
                  开始复习 · {dueCount} 句到期
                </Text>
              </Pressable>
            )}

            {/* 区域标题 */}
            <Text style={styles.sectionTitle}>到期复习</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyText}>暂无到期句子</Text>
            <Text style={styles.emptyHint}>
              导入素材并练习后{'\n'}困难句将出现在这里
            </Text>
            <Pressable
              style={styles.emptyAction}
              onPress={() => router.push('/(tabs)/library')}
            >
              <Text style={styles.emptyActionText}>去素材库导入</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.dueCard}>
            <View style={styles.dueIndexBadge}>
              <Text style={styles.dueIndexText}>{index + 1}</Text>
            </View>
            <Text style={styles.dueText} numberOfLines={2}>
              {item.text}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg,
  },
  // 统计卡片
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderTopWidth: 3,
    ...shadows.sm,
  },
  statValue: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: fontWeights.medium,
  },
  // 今日数据横幅
  practiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  practiceItem: {
    flex: 1,
  },
  practiceLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  practiceValue: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    marginTop: spacing.xs,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  // 复习 CTA
  reviewStartBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
  },
  reviewStartText: {
    color: colors.textInverse,
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
  emptyAction: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.full,
  },
  emptyActionText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  // 复习卡片
  dueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgWhite,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  dueIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueIndexText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  dueText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.text,
    lineHeight: 22,
    marginTop: spacing.xs / 2,
  },
});
