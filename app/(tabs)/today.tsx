// 今日页：到期复习、今日新增、有效练习与无字幕听懂率

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { getDatabase } from '../../src/db/client';
import { getDueSegments, getReviewStats } from '../../src/db/repositories';
import { getEffectivePracticeDurationMs } from '../../src/db/repositories/practiceAttemptRepo';
import { colors, spacing, fontSizes, radius } from '../../src/theme';

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
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [practiceMs, setPracticeMs] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const db = await getDatabase();
    const [due, reviewStats, effectiveMs] = await Promise.all([
      getDueSegments(db),
      getReviewStats(db),
      getEffectivePracticeDurationMs(db, getStartOfTodayMs()),
    ]);
    setDueItems(due);
    setStats(reviewStats);
    setPracticeMs(effectiveMs);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const practiceMin = Math.round(practiceMs / 60000);

  return (
    <View style={styles.container}>
      {/* 统计卡片 */}
      <View style={styles.statsRow}>
        <StatCard label="待复习" value={stats?.dueCount ?? 0} color={colors.stateDue} />
        <StatCard label="练习中" value={stats?.practicingCount ?? 0} color={colors.statePracticing} />
        <StatCard label="已掌握" value={stats?.masteredCount ?? 0} color={colors.stateMastered} />
      </View>

      <View style={styles.practiceBanner}>
        <Text style={styles.practiceLabel}>今日有效练习</Text>
        <Text style={styles.practiceValue}>{practiceMin} 分钟</Text>
      </View>

      {/* 到期复习列表 */}
      <Text style={styles.sectionTitle}>
        到期复习 ({dueItems.length})
      </Text>

      {dueItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无到期句子</Text>
          <Text style={styles.emptyHint}>导入素材并练习后，困难句将出现在这里</Text>
        </View>
      ) : (
        <FlatList
          data={dueItems}
          keyExtractor={(item) => item.segment_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item, index }) => (
            <Pressable style={styles.dueCard}>
              <Text style={styles.dueIndex}>{index + 1}</Text>
              <Text style={styles.dueText} numberOfLines={2}>
                {item.text}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}
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

function getStartOfTodayMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderTopWidth: 3,
  },
  statValue: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  practiceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  practiceLabel: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
  },
  practiceValue: {
    color: colors.textInverse,
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  dueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  dueIndex: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 24,
  },
  dueText: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
});
