// 精练播放器：单句循环、变速、字幕模式、标记、回声跟读（§7 + FR-P01~P06）

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { getDatabase } from '../../src/db/client';
import {
  getProjectById,
  getSegmentsByProject,
  markResult,
  createAttempt,
} from '../../src/db/repositories';
import type { MediaProject, Segment } from '../../src/db/types';
import { colors, spacing, fontSizes, radius } from '../../src/theme';
import { useShadowRecorder } from '../../src/hooks/useShadowRecorder';
import { trackEvent } from '../../src/services/analytics';

type SubtitleMode = 'english' | 'hidden' | 'answer';
type PlaybackSpeed = 0.75 | 1 | 1.25;
type MarkType = 'understood' | 'not_smooth' | 'mastered';

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25];
const LEAD_IN_MS = 200;
const LEAD_OUT_MS = 400;

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<MediaProject | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('english');
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastMark, setLastMark] = useState<MarkType | null>(null);
  const [shadowPanelOpen, setShadowPanelOpen] = useState(false);

  const currentSegment = segments[currentIndex];
  const shadow = useShadowRecorder(currentSegment?.id);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.05;
    p.preservesPitch = true;
  });

  const loadData = useCallback(async () => {
    if (!id) return;
    const db = await getDatabase();
    const proj = await getProjectById(db, id);
    const segs = await getSegmentsByProject(db, id).then((s) =>
      s.filter((seg) => !seg.skip_type),
    );
    setProject(proj);
    setSegments(segs);
    if (proj && segs.length > 0) {
      player.replace(proj.local_uri);
    }
  }, [id, player]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // 加载录音列表
  useFocusEffect(
    useCallback(() => {
      if (currentSegment) {
        shadow.loadRecordings();
      }
    }, [currentSegment]),
  );

  const seekToSegment = useCallback(
    (index: number) => {
      const seg = segments[index];
      if (!seg) return;
      const seekMs = Math.max(0, seg.start_ms - LEAD_IN_MS);
      player.currentTime = seekMs / 1000;
      setCurrentIndex(index);
      setShowAnswer(false);
      setLastMark(null);
      setShadowPanelOpen(false);
      shadow.reset();
    },
    [segments, player, shadow],
  );

  // 循环 + 跟读流程中的播放监听
  useEventListener(player, 'timeUpdate', (event) => {
    if (!currentSegment) return;

    const currentTimeMs = event.currentTime * 1000;
    const endWithBuffer = currentSegment.end_ms + LEAD_OUT_MS;

    // 回声跟读模式：原句播放完后进入留白→录音
    if (shadow.phase === 'playing_source' && currentTimeMs >= currentSegment.end_ms) {
      player.pause();
      const segDuration = currentSegment.end_ms - currentSegment.start_ms;
      shadow.startRecordingAfterDelay(Math.max(segDuration, 1000));
      return;
    }

    // 普通循环
    if (isLooping && shadow.phase === 'idle' && currentTimeMs >= endWithBuffer) {
      const seekMs = Math.max(0, currentSegment.start_ms - LEAD_IN_MS);
      player.currentTime = seekMs / 1000;
    }
  });

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const toggleLoop = useCallback(() => setIsLooping((p) => !p), []);

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    player.playbackRate = next;
  }, [speed, player]);

  const cycleSubtitleMode = useCallback(() => {
    const modes: SubtitleMode[] = ['english', 'hidden', 'answer'];
    const idx = modes.indexOf(subtitleMode);
    const next = modes[(idx + 1) % modes.length];
    setSubtitleMode(next);
    if (next !== 'answer') setShowAnswer(false);
  }, [subtitleMode]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) seekToSegment(currentIndex - 1);
  }, [currentIndex, seekToSegment]);

  const goNext = useCallback(() => {
    if (currentIndex < segments.length - 1) seekToSegment(currentIndex + 1);
  }, [currentIndex, segments.length, seekToSegment]);

  const handleMark = useCallback(
    async (mark: MarkType) => {
      if (!currentSegment) return;
      const db = await getDatabase();
      await createAttempt(db, {
        segmentId: currentSegment.id,
        mode: 'blind_listen',
        result: mark,
      });
      await markResult(db, currentSegment.id, mark);
      setLastMark(mark);
      trackEvent('blind_listen_completed', { result: mark });
    },
    [currentSegment],
  );

  // 开始回声跟读
  const handleStartShadow = useCallback(async () => {
    if (!currentSegment) return;
    setShadowPanelOpen(true);
    setIsLooping(false);
    const ok = await shadow.startShadowing();
    if (!ok) {
      setShadowPanelOpen(false);
      setIsLooping(true);
      Alert.alert('无法录音', shadow.error ?? '请检查录音权限');
      return;
    }
    // 从切片起点播放
    const seekMs = Math.max(0, currentSegment.start_ms - LEAD_IN_MS);
    player.currentTime = seekMs / 1000;
    player.play();
    trackEvent('shadow_started');
  }, [currentSegment, shadow, player]);

  // 停止录音
  const handleStopRecording = useCallback(async () => {
    const uri = await shadow.stopRecording();
    if (uri) {
      trackEvent('recording_saved');
    }
  }, [shadow]);

  // 取消跟读
  const handleCancelShadow = useCallback(async () => {
    await shadow.cancelRecording();
    setShadowPanelOpen(false);
    setIsLooping(true);
  }, [shadow]);

  // 播放录音
  const handlePlayRecording = useCallback(
    (uri: string) => {
      // 用 player 临时播放录音
      player.replace(uri);
      player.play();
    },
    [player],
  );

  if (!project) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (segments.length === 0) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>此项目还没有字幕</Text>
        <Pressable
          style={styles.goEditBtn}
          onPress={() => router.replace(`/project/${project.id}`)}
        >
          <Text style={styles.goEditText}>去添加字幕</Text>
        </Pressable>
      </View>
    );
  }

  if (!currentSegment) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>没有可练习的切片</Text>
      </View>
    );
  }

  const subtitleLabels: Record<SubtitleMode, string> = {
    english: '英文字幕',
    hidden: '盲听',
    answer: showAnswer ? '显示答案' : '盲听',
  };

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <VideoView
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
        />
      </View>

      {/* 字幕区域 */}
      <View style={styles.subtitleArea}>
        {subtitleMode === 'english' && (
          <Text style={styles.subtitleText}>{currentSegment.text}</Text>
        )}
        {subtitleMode === 'hidden' && (
          <Text style={[styles.subtitleText, styles.subtitleMuted]}>
            （盲听模式）
          </Text>
        )}
        {subtitleMode === 'answer' && (
          showAnswer ? (
            <Text style={styles.subtitleText}>{currentSegment.text}</Text>
          ) : (
            <Pressable onPress={() => setShowAnswer(true)}>
              <Text style={[styles.subtitleText, styles.subtitleMuted]}>
                👆 点击显示答案
              </Text>
            </Pressable>
          )
        )}
      </View>

      {/* 跟读面板 */}
      {shadowPanelOpen && (
        <ShadowPanel
          phase={shadow.phase}
          recordings={shadow.recordings}
          onStopRecording={handleStopRecording}
          onCancel={handleCancelShadow}
          onPlayRecording={handlePlayRecording}
          onDeleteRecording={shadow.deleteRecording}
        />
      )}

      {/* 切片信息 */}
      <View style={styles.segmentInfo}>
        <Text style={styles.segmentIndex}>
          第 {currentIndex + 1} / {segments.length} 句
        </Text>
        <Text style={styles.segmentTime}>
          {formatMs(currentSegment.start_ms)} - {formatMs(currentSegment.end_ms)}
        </Text>
      </View>

      {/* 播放控制 */}
      <View style={styles.controlsRow}>
        <Pressable style={styles.controlBtn} onPress={goPrev} disabled={currentIndex === 0}>
          <Text style={[styles.controlBtnText, currentIndex === 0 && styles.disabled]}>⏮</Text>
        </Pressable>
        <Pressable style={styles.playBtn} onPress={togglePlay}>
          <Text style={styles.playBtnText}>{player.playing ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable
          style={styles.controlBtn}
          onPress={goNext}
          disabled={currentIndex === segments.length - 1}
        >
          <Text style={[styles.controlBtnText, currentIndex === segments.length - 1 && styles.disabled]}>⏭</Text>
        </Pressable>
      </View>

      {/* 设置按钮组 */}
      <View style={styles.settingsRow}>
        <Pressable
          style={[styles.settingChip, isLooping && styles.chipActive]}
          onPress={toggleLoop}
        >
          <Text style={[styles.chipText, isLooping && styles.chipTextActive]}>
            {isLooping ? '循环 ✓' : '循环'}
          </Text>
        </Pressable>
        <Pressable style={styles.settingChip} onPress={cycleSpeed}>
          <Text style={styles.chipText}>{speed}×</Text>
        </Pressable>
        <Pressable
          style={[styles.settingChip, subtitleMode !== 'english' && styles.chipActive]}
          onPress={cycleSubtitleMode}
        >
          <Text style={[styles.chipText, subtitleMode !== 'english' && styles.chipTextActive]}>
            {subtitleLabels[subtitleMode]}
          </Text>
        </Pressable>
        {/* 回声跟读按钮 */}
        {!shadowPanelOpen && (
          <Pressable
            style={[styles.settingChip, styles.shadowChip]}
            onPress={handleStartShadow}
          >
            <Text style={[styles.chipText, { fontWeight: '600' }]}>🎙 跟读</Text>
          </Pressable>
        )}
      </View>

      {/* 标记按钮组 */}
      <View style={styles.markRow}>
        <Pressable
          style={[styles.markBtn, { backgroundColor: colors.warning }, lastMark === 'understood' && styles.markBtnActive]}
          onPress={() => handleMark('understood')}
        >
          <Text style={styles.markBtnText}>没听懂</Text>
        </Pressable>
        <Pressable
          style={[styles.markBtn, { backgroundColor: colors.stateDue }, lastMark === 'not_smooth' && styles.markBtnActive]}
          onPress={() => handleMark('not_smooth')}
        >
          <Text style={styles.markBtnText}>没说顺</Text>
        </Pressable>
        <Pressable
          style={[styles.markBtn, { backgroundColor: colors.success }, lastMark === 'mastered' && styles.markBtnActive]}
          onPress={() => handleMark('mastered')}
        >
          <Text style={styles.markBtnText}>已掌握</Text>
        </Pressable>
      </View>

      <Pressable style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeBtnText}>退出练习</Text>
      </Pressable>
    </View>
  );
}

// 回声跟读面板组件
function ShadowPanel({
  phase,
  recordings,
  onStopRecording,
  onCancel,
  onPlayRecording,
  onDeleteRecording,
}: {
  phase: string;
  recordings: Array<{ id: string; recording_uri: string | null; duration_ms: number | null; created_at: number }>;
  onStopRecording: () => void;
  onCancel: () => void;
  onPlayRecording: (uri: string) => void;
  onDeleteRecording: (attemptId: string, uri: string) => void;
}) {
  const phaseLabels: Record<string, string> = {
    idle: '准备中...',
    playing_source: '🔊 播放原句...',
    waiting: '⏳ 留白中，准备录音...',
    recording: '🔴 录音中... 点击停止',
    recorded: '✅ 录音完成',
  };

  return (
    <View style={styles.shadowPanel}>
      <View style={styles.shadowStatusRow}>
        <Text style={styles.shadowStatusText}>{phaseLabels[phase] ?? phase}</Text>
        <Pressable onPress={onCancel}>
          <Text style={styles.shadowCancel}>✕</Text>
        </Pressable>
      </View>

      {/* 录音按钮 */}
      {phase === 'recording' && (
        <Pressable style={styles.recordStopBtn} onPress={onStopRecording}>
          <Text style={styles.recordStopText}>⏹ 停止录音</Text>
        </Pressable>
      )}

      {/* 已有录音列表 */}
      {recordings.length > 0 && phase !== 'recording' && (
        <View style={styles.recordingList}>
          <Text style={styles.recordingListTitle}>我的录音 ({recordings.length})</Text>
          <ScrollView style={{ maxHeight: 120 }}>
            {recordings.map((rec, idx) => (
              <View key={rec.id} style={styles.recordingItem}>
                <Text style={styles.recordingIndex}>{idx + 1}</Text>
                <Text style={styles.recordingDuration}>
                  {rec.duration_ms ? `${(rec.duration_ms / 1000).toFixed(1)}s` : ''}
                </Text>
                {rec.recording_uri && (
                  <>
                    <Pressable
                      style={styles.recordingPlayBtn}
                      onPress={() => onPlayRecording(rec.recording_uri!)}
                    >
                      <Text style={styles.recordingPlayText}>▶</Text>
                    </Pressable>
                    <Pressable
                      style={styles.recordingDeleteBtn}
                      onPress={() => onDeleteRecording(rec.id, rec.recording_uri!)}
                    >
                      <Text style={styles.recordingDeleteText}>🗑</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
  },
  loadingText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
  },
  goEditBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  goEditText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  subtitleArea: {
    minHeight: 80,
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
  },
  subtitleText: {
    fontSize: fontSizes.xl,
    color: colors.textInverse,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '500',
  },
  subtitleMuted: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: '400',
  },
  shadowPanel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  shadowStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shadowStatusText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '500',
  },
  shadowCancel: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
  },
  shadowChip: {
    backgroundColor: colors.accent,
  },
  recordStopBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  recordStopText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
    fontWeight: '700',
  },
  recordingList: {
    marginTop: spacing.sm,
  },
  recordingListTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginBottom: spacing.xs,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recordingIndex: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    minWidth: 20,
  },
  recordingDuration: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    flex: 1,
  },
  recordingPlayBtn: {
    paddingHorizontal: spacing.sm,
  },
  recordingPlayText: {
    color: colors.textInverse,
    fontSize: fontSizes.md,
  },
  recordingDeleteBtn: {
    paddingHorizontal: spacing.xs,
  },
  recordingDeleteText: {
    fontSize: fontSizes.md,
  },
  segmentInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentIndex: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  segmentTime: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  controlBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnText: {
    fontSize: 28,
    color: colors.textInverse,
  },
  disabled: {
    opacity: 0.3,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnText: {
    fontSize: 28,
    color: colors.textInverse,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  chipTextActive: {
    fontWeight: '600',
  },
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  markBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
    opacity: 0.9,
  },
  markBtnActive: {
    opacity: 1,
    transform: [{ scale: 1.05 }],
  },
  markBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  closeBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
