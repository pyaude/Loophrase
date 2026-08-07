// 复习会话：到期句子队列 → 盲听 → 自评 → 记录

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { getDatabase } from '../src/db/client';
import { getDueSegments, markResult, createAttempt, getProjectById } from '../src/db/repositories';
import type { MediaProject, Segment } from '../src/db/types';
import { colors, spacing, fontSizes, radius } from '../src/theme';

type ReviewItem = {
  segment_id: string;
  project_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
};

const LEAD_IN_MS = 200;
const LEAD_OUT_MS = 400;

export default function ReviewScreen() {
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [projectCache, setProjectCache] = useState<Record<string, MediaProject>>({});

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.05;
    p.preservesPitch = true;
  });

  const loadQueue = useCallback(async () => {
    const db = await getDatabase();
    const items = await getDueSegments(db);
    setQueue(items);

    // 预加载项目信息
    const projMap: Record<string, MediaProject> = {};
    for (const item of items) {
      if (!projMap[item.project_id]) {
        projMap[item.project_id] = (await getProjectById(db, item.project_id))!;
      }
    }
    setProjectCache(projMap);

    // 加载第一个切片
    if (items.length > 0) {
      const proj = projMap[items[0].project_id];
      if (proj) {
        player.replace(proj.local_uri);
        player.currentTime = Math.max(0, (items[0].start_ms - LEAD_IN_MS) / 1000);
        player.play();
      }
    }
  }, [player]);

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue]),
  );

  const currentItem = queue[index];

  // 循环播放当前切片
  useEventListener(player, 'timeUpdate', (event) => {
    if (!currentItem) return;
    const currentTimeMs = event.currentTime * 1000;
    if (currentTimeMs >= currentItem.end_ms + LEAD_OUT_MS) {
      player.currentTime = Math.max(0, (currentItem.start_ms - LEAD_IN_MS) / 1000);
    }
  });

  // 标记并进入下一切片
  const handleMark = useCallback(
    async (mark: 'understood' | 'not_smooth' | 'mastered') => {
      if (!currentItem) return;
      const db = await getDatabase();

      await createAttempt(db, {
        segmentId: currentItem.segment_id,
        mode: 'blind_listen',
        result: mark,
      });
      await markResult(db, currentItem.segment_id, mark);

      if (index + 1 >= queue.length) {
        setIsFinished(true);
        player.pause();
      } else {
        const next = queue[index + 1];
        const proj = projectCache[next.project_id];
        if (proj) {
          player.currentTime = Math.max(0, (next.start_ms - LEAD_IN_MS) / 1000);
          player.play();
        }
        setIndex(index + 1);
        setShowAnswer(false);
      }
    },
    [currentItem, index, queue, player, projectCache],
  );

  // 切换答案显示
  const toggleAnswer = useCallback(() => {
    if (!showAnswer) {
      player.pause();
    } else {
      player.play();
    }
    setShowAnswer(!showAnswer);
  }, [showAnswer, player]);

  const replayAudio = useCallback(() => {
    if (!currentItem) return;
    player.currentTime = Math.max(0, (currentItem.start_ms - LEAD_IN_MS) / 1000);
    player.play();
  }, [currentItem, player]);

  // 空状态
  if (queue.length === 0 && !isFinished) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>暂无到期复习</Text>
        <Text style={styles.emptyHint}>练习过的困难句将在到期后出现在这里</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  // 完成状态
  if (isFinished) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>复习完成！🎉</Text>
        <Text style={styles.emptyHint}>
          本次复习了 {queue.length} 个句子{'\n'}坚持复习，语感会越来越好
        </Text>
        <Pressable style={styles.backBtn} onPress={() => router.replace('/(tabs)/today')}>
          <Text style={styles.backBtnText}>返回今日</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 隐藏视频 */}
      <View style={{ width: 1, height: 1, opacity: 0 }}>
        <VideoView
          player={player}
          style={{ width: 1, height: 1 }}
          nativeControls={false}
        />
      </View>

      {/* 进度 */}
      <Text style={styles.progressText}>
        复习 {index + 1} / {queue.length}
      </Text>

      {/* 盲听/答案区域 */}
      <View style={styles.listenArea}>
        {!showAnswer ? (
          <View style={styles.blindCard}>
            <Text style={styles.blindHint}>盲听中...</Text>
            <Text style={styles.blindSubtext}>先仔细听，再看答案</Text>
          </View>
        ) : (
          <ScrollView style={styles.answerCard}>
            <Text style={styles.answerText}>{currentItem?.text}</Text>
          </ScrollView>
        )}
      </View>

      {/* 控制按钮 */}
      <View style={styles.controlsRow}>
        <Pressable style={styles.replayBtn} onPress={replayAudio}>
          <Text style={styles.replayBtnText}>🔁 重新听</Text>
        </Pressable>
        <Pressable
          style={[styles.answerBtn, showAnswer && styles.answerBtnActive]}
          onPress={toggleAnswer}
        >
          <Text style={styles.answerBtnText}>
            {showAnswer ? '隐藏答案' : '显示答案'}
          </Text>
        </Pressable>
      </View>

      {/* 自评标记（显示答案后） */}
      {showAnswer && (
        <View style={styles.markRow}>
          <Pressable
            style={[styles.markBtn, { backgroundColor: colors.warning }]}
            onPress={() => handleMark('understood')}
          >
            <Text style={styles.markBtnText}>没听懂</Text>
          </Pressable>
          <Pressable
            style={[styles.markBtn, { backgroundColor: colors.stateDue }]}
            onPress={() => handleMark('not_smooth')}
          >
            <Text style={styles.markBtnText}>没说顺</Text>
          </Pressable>
          <Pressable
            style={[styles.markBtn, { backgroundColor: colors.success }]}
            onPress={() => handleMark('mastered')}
          >
            <Text style={styles.markBtnText}>已掌握</Text>
          </Pressable>
        </View>
      )}

      {/* 退出 */}
      <Pressable style={styles.exitBtn} onPress={() => router.back()}>
        <Text style={styles.exitText}>退出复习</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyHint: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  backBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  listenArea: {
    flex: 1,
    justifyContent: 'center',
  },
  blindCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  blindHint: {
    color: colors.textInverse,
    fontSize: fontSizes.xxl,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  blindSubtext: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
  },
  answerCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: 300,
  },
  answerText: {
    color: colors.textInverse,
    fontSize: fontSizes.xl,
    lineHeight: 32,
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  replayBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replayBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
  },
  answerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  answerBtnActive: {
    backgroundColor: colors.primaryLight,
  },
  answerBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: spacing.md,
  },
  markBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  markBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  exitBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  exitText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
