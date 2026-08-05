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

  return (
    <View style={styles.container}>
      {/* 统计卡片 */}
      <View style={styles.statsRow}>
        <StatCard label="待复习" value={stats?.dueCount ?? 0} color={colors.stateDue} />
        <StatCard label="练习中" value={stats?.practicingCount ?? 0} color={colors.statePracticing} />
        <StatCard label="已掌握" value={stats?.masteredCount ?? 0} color={colors.stateMastered} />
      </View>

      <View style={styles.practiceBanner}>
        <View>
          <Text style={styles.practiceLabel}>今日有效练习</Text>
          <Text style={styles.practiceValue}>{practiceMin} 分钟</Text>
        </View>
        <View style={styles.rateBox}>
          <Text style={styles.rateLabel}>无字幕听懂率</Text>
          <Text style={styles.rateValue}>
            {understoodRate !== null ? `${understoodRate}%` : '—'}
          </Text>
        </View>
      </View>

      {/* 开始复习按钮 */}
      {(stats?.dueCount ?? 0) > 0 && (
        <Pressable
          style={styles.reviewStartBtn}
          onPress={() => router.push('/review')}
        >
          <Text style={styles.reviewStartText}>
            开始复习 ({stats?.dueCount} 句)
          </Text>
        </Pressable>
      )}

      {/* 到期复习列表 */}
      <Text style={styles.sectionTitle}>到期复习 ({dueItems.length})</Text>

      {dueItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无到期句子</Text>
          <Text style={styles.emptyHint}>
            导入素材并练习后，困难句将出现在这里
          </Text>
          <Pressable
            style={styles.emptyAction}
            onPress={() => router.push('/(tabs)/library')}
          >
            <Text style={styles.emptyActionText}>去素材库导入</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={dueItems}
          keyExtractor={(item) => item.segment_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item, index }) => (
            <View style={styles.dueCard}>
              <Text style={styles.dueIndex}>{index + 1}</Text>
              <Text style={styles.dueText} numberOfLines={2}>
                {item.text}
              </Text>
            </View>
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
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSizes.sm,
  },
  practiceValue: {
    color: colors.textInverse,
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  rateBox: {
    alignItems: 'flex-end',
  },
  rateLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSizes.sm,
  },
  rateValue: {
    color: colors.textInverse,
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  reviewStartBtn: {
    backgroundColor: colors.stateDue,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  reviewStartText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '600',
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
  emptyAction: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  emptyActionText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
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
