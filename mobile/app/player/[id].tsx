// 精练播放器：单句循环、变速、字幕模式、标记、回声跟读（§7 + FR-P01~P06）

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { NavigationBar } from 'expo-navigation-bar';
import { useEventListener } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { Platform } from 'react-native';
import { getDatabase } from '../../src/db/client';
import {
  getProjectById,
  getSegmentsByProject,
  markResult,
  createAttempt,
  incrementListenCount,
  incrementReadCount,
  getSegmentStats,
} from '../../src/db/repositories';
import type { MediaProject, Segment } from '../../src/db/types';
import { colors, spacing, fontSizes, fontWeights, radius } from '../../src/theme';
import { useShadowRecorder } from '../../src/hooks/useShadowRecorder';
import { trackEvent } from '../../src/services/analytics';

type SubtitleMode = 'english' | 'hidden' | 'answer';
type PlaybackSpeed = 0.75 | 1 | 1.25;
type MarkType = 'understood' | 'not_smooth' | 'mastered';

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25];
const REPEAT_OPTIONS = [0, 2, 3, 5]; // 0 = ∞
const PAUSE_SENTINEL = -1; // -1 = 跟随句长
const PAUSE_OPTIONS = [PAUSE_SENTINEL, 0, 1000, 2000, 3000];
const LEAD_IN_MS = 200;
const LEAD_OUT_MS = 400;

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useKeepAwake();

  const [project, setProject] = useState<MediaProject | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatCount, setRepeatCount] = useState(3); // 每句复读次数，0=∞
  const [pauseMs, setPauseMs] = useState<number>(PAUSE_SENTINEL); // 每次复读间隔，-1=跟随句长
  const [currentRepeat, setCurrentRepeat] = useState(0); // 当前已复读次数
  const [isPausing, setIsPausing] = useState(false); // 是否在间隔等待中
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('english');
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastMark, setLastMark] = useState<MarkType | null>(null);
  const [shadowPanelOpen, setShadowPanelOpen] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, { listen_count: number; read_count: number }>>({});
  const [controlsVisible, setControlsVisible] = useState(true);
  const [alwaysShowSubtitle, setAlwaysShowSubtitle] = useState(true);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // 横屏时视频 contain 模式下的实际宽度（假设 16:9 视频，常见比例）
  const landscapeVideoWidth = isLandscape ? height * (16 / 9) : width;

  const currentSegment = segments[currentIndex];
  const shadow = useShadowRecorder(currentSegment?.id);

  // refs 供 timeUpdate 回调使用，避免闭包过期
  const repeatCountRef = useRef(repeatCount);
  const pauseMsRef = useRef(pauseMs);
  const currentRepeatRef = useRef(0);
  const isPausedRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const currentIndexRef = useRef(0);
  const listenCountedRef = useRef(false);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.05;
    p.preservesPitch = true;
  });

  const CONTROLS_HIDE_DELAY = 4000; // 手动点击后 4 秒自动隐藏

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  // 播放期间隐藏控制按钮；暂停/跟读时保持显示
  useEffect(() => {
    if (shadowPanelOpen || isPausing || !player.playing) {
      setControlsVisible(true);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    } else {
      // 播放恢复时立即隐藏
      setControlsVisible(false);
    }
  }, [shadowPanelOpen, isPausing, player.playing]);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      // 退出播放器时恢复系统导航栏
      if (Platform.OS === 'android') {
        NavigationBar.setHidden(false);
      }
    };
  }, []);

  useEffect(() => { repeatCountRef.current = repeatCount; }, [repeatCount]);
  useEffect(() => { pauseMsRef.current = pauseMs; }, [pauseMs]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const seekToSegment = useCallback(
    (index: number, autoPlay = true) => {
      const seg = segmentsRef.current[index];
      if (!seg) return;
      // 清除暂停定时器
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      isPausedRef.current = false;
      setIsPausing(false);
      currentRepeatRef.current = 0;
      setCurrentRepeat(0);
      listenCountedRef.current = false;

      const seekMs = Math.max(0, seg.start_ms - LEAD_IN_MS);
      player.currentTime = seekMs / 1000;
      setCurrentIndex(index);
      setShowAnswer(false);
      setLastMark(null);
      setShadowPanelOpen(false);
      shadow.reset();
      if (autoPlay) player.play();
    },
    [player, shadow],
  );

  const loadData = useCallback(async () => {
    if (!id) return;
    const db = await getDatabase();
    const proj = await getProjectById(db, id);
    const segs = await getSegmentsByProject(db, id).then((s) =>
      s.filter((seg) => !seg.skip_type),
    );
    setProject(proj);
    setSegments(segs);
    segmentsRef.current = segs;
    // 加载听/读次数统计
    const stats = await getSegmentStats(db, segs.map((s) => s.id));
    setStatsMap(stats);
    if (proj && segs.length > 0) {
      currentRepeatRef.current = 0;
      setCurrentRepeat(0);
      player.replace(proj.local_uri);
      const seekMs = Math.max(0, segs[0].start_ms - LEAD_IN_MS) / 1000;
      const timer = setTimeout(() => {
        player.currentTime = seekMs;
        player.play();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [id, player]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useFocusEffect(
    useCallback(() => {
      if (currentSegment) {
        shadow.loadRecordings();
      }
    }, [currentSegment]),
  );

  // 播放监听：复读 + 跟读流程
  useEventListener(player, 'timeUpdate', (event) => {
    const seg = segmentsRef.current[currentIndexRef.current];
    if (!seg) return;

    const currentTimeMs = event.currentTime * 1000;
    const endWithBuffer = seg.end_ms + LEAD_OUT_MS;

    // 统计听次数：每播完一句 +1（每次从头播放只计一次）
    if (currentTimeMs >= seg.end_ms && !listenCountedRef.current) {
      listenCountedRef.current = true;
      getDatabase().then((db) => incrementListenCount(db, seg.id)).then(() => {
        setStatsMap((prev) => ({
          ...prev,
          [seg.id]: {
            listen_count: (prev[seg.id]?.listen_count ?? 0) + 1,
            read_count: prev[seg.id]?.read_count ?? 0,
          },
        }));
      });
    }

    // 回声跟读模式
    if (shadow.phase === 'playing_source' && currentTimeMs >= seg.end_ms) {
      player.pause();
      const segDuration = seg.end_ms - seg.start_ms;
      shadow.startRecordingAfterDelay(Math.max(segDuration, 1000));
      return;
    }

    // 普通复读逻辑
    if (shadow.phase === 'idle' && !isPausedRef.current && currentTimeMs >= endWithBuffer) {
      player.pause();
      const rc = repeatCountRef.current;
      const cr = currentRepeatRef.current;

      // 还需要继续复读
      if (rc === 0 || cr < rc - 1) {
        currentRepeatRef.current = cr + 1;
        setCurrentRepeat(cr + 1);
        isPausedRef.current = true;
        setIsPausing(true);

        // pauseMs = -1 时跟随当前句长，否则使用设定值
        const rawPause = pauseMsRef.current;
        const pauseDuration = rawPause === PAUSE_SENTINEL
          ? Math.max(seg.end_ms - seg.start_ms, 500)
          : rawPause;
        const seekMs = Math.max(0, seg.start_ms - LEAD_IN_MS);
        pauseTimerRef.current = setTimeout(() => {
          player.currentTime = seekMs / 1000;
          player.play();
          isPausedRef.current = false;
          setIsPausing(false);
          listenCountedRef.current = false;
          pauseTimerRef.current = null;
        }, pauseDuration);
      } else {
        // 复读次数用完，自动跳下一句
        const nextIndex = currentIndexRef.current + 1;
        if (nextIndex < segmentsRef.current.length) {
          // 短暂停顿后自动跳转
          isPausedRef.current = true;
          setIsPausing(true);
          const rawPause = pauseMsRef.current;
          const pauseDuration = rawPause === PAUSE_SENTINEL
            ? Math.max(seg.end_ms - seg.start_ms, 500)
            : rawPause;
          pauseTimerRef.current = setTimeout(() => {
            seekToSegment(nextIndex);
          }, Math.max(pauseDuration, 500));
        } else {
          // 最后一句复读完毕，回到第一句重新开始
          isPausedRef.current = true;
          setIsPausing(true);
          pauseTimerRef.current = setTimeout(() => {
            seekToSegment(0);
          }, Math.max(pauseMsRef.current === PAUSE_SENTINEL
            ? Math.max(seg.end_ms - seg.start_ms, 500)
            : pauseMsRef.current, 500));
        }
      }
    }
  });

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      if (prev) {
        if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        return false;
      }
      showControlsTemporarily();
      return true;
    });
  }, [showControlsTemporarily]);

  const togglePlay = useCallback(() => {
    // 如果在暂停等待中，点击播放立即跳过等待
    if (isPausedRef.current && pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
      isPausedRef.current = false;
      setIsPausing(false);
      player.play();
      return;
    }
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const cycleRepeat = useCallback(() => {
    const idx = REPEAT_OPTIONS.indexOf(repeatCount);
    setRepeatCount(REPEAT_OPTIONS[(idx + 1) % REPEAT_OPTIONS.length]);
  }, [repeatCount]);

  const cyclePause = useCallback(() => {
    const idx = PAUSE_OPTIONS.indexOf(pauseMs);
    setPauseMs(PAUSE_OPTIONS[(idx + 1) % PAUSE_OPTIONS.length]);
  }, [pauseMs]);

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
    if (currentIndexRef.current > 0) seekToSegment(currentIndexRef.current - 1);
  }, [seekToSegment]);

  const goNext = useCallback(() => {
    if (currentIndexRef.current < segmentsRef.current.length - 1) {
      seekToSegment(currentIndexRef.current + 1);
    }
  }, [seekToSegment]);

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

  const handleStartShadow = useCallback(async () => {
    if (!currentSegment) return;
    setShadowPanelOpen(true);
    const ok = await shadow.startShadowing();
    if (!ok) {
      setShadowPanelOpen(false);
      Alert.alert('无法录音', shadow.error ?? '请检查录音权限');
      return;
    }
    const seekMs = Math.max(0, currentSegment.start_ms - LEAD_IN_MS);
    player.currentTime = seekMs / 1000;
    player.play();
    trackEvent('shadow_started');
  }, [currentSegment, shadow, player]);

  const handleStopRecording = useCallback(async () => {
    const uri = await shadow.stopRecording();
    if (uri) {
      trackEvent('recording_saved');
      // 统计读次数
      if (currentSegment) {
        const db = await getDatabase();
        await incrementReadCount(db, currentSegment.id);
        setStatsMap((prev) => ({
          ...prev,
          [currentSegment.id]: {
            listen_count: prev[currentSegment.id]?.listen_count ?? 0,
            read_count: (prev[currentSegment.id]?.read_count ?? 0) + 1,
          },
        }));
      }
    }
  }, [shadow, currentSegment]);

  const handleCancelShadow = useCallback(async () => {
    await shadow.cancelRecording();
    setShadowPanelOpen(false);
  }, [shadow]);

  const handlePlayRecording = useCallback(
    (uri: string) => {
      player.replace(uri);
      player.play();
    },
    [player],
  );

  if (!project) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <Text style={styles.loadingText}>加载中...</Text>
      </SafeAreaView>
    );
  }

  if (segments.length === 0) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <Text style={styles.loadingText}>此项目还没有字幕</Text>
        <Pressable
          style={styles.goEditBtn}
          onPress={() => router.replace(`/project/${project.id}`)}
        >
          <Text style={styles.goEditText}>去添加字幕</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!currentSegment) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <Text style={styles.loadingText}>没有可练习的切片</Text>
      </SafeAreaView>
    );
  }

  const subtitleLabels: Record<SubtitleMode, string> = {
    english: '英文字幕',
    hidden: '盲听',
    answer: showAnswer ? '显示答案' : '盲听',
  };

  const repeatLabel = repeatCount === 0 ? '∞' : `${currentRepeat + 1}/${repeatCount}`;
  const pauseLabel = pauseMs === PAUSE_SENTINEL
    ? '句长'
    : pauseMs === 0
      ? '不停顿'
      : `${pauseMs / 1000}s`;

  const subtitleVisible = alwaysShowSubtitle || controlsVisible;

  return (
    <View style={styles.container}>
      <StatusBar hidden={isLandscape} />
      {Platform.OS === 'android' && <NavigationBar hidden={isLandscape} style="light" />}
      <View
        style={
          isLandscape
            ? styles.landscapeVideoContainer
            : styles.videoContainer
        }
      >
        <VideoView
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
        />
      </View>

      {isLandscape ? (
        <Pressable
          style={[styles.landscapeOverlay, { width: landscapeVideoWidth, left: (width - landscapeVideoWidth) / 2 }]}
          onPress={toggleControls}
        >
          {/* 字幕区域 - 横屏 */}
          <View style={styles.landscapeSubtitleArea}>
            {subtitleVisible && subtitleMode === 'english' && (
              <Text style={styles.subtitleText}>{currentSegment.text}</Text>
            )}
            {subtitleVisible && subtitleMode === 'hidden' && (
              <Text style={[styles.subtitleText, styles.subtitleMuted]}>
                （盲听模式）
              </Text>
            )}
            {subtitleVisible && subtitleMode === 'answer' && (
              showAnswer ? (
                <Text style={styles.subtitleText}>{currentSegment.text}</Text>
              ) : (
                <Text style={[styles.subtitleText, styles.subtitleMuted]}>
                  👆 点击显示答案
                </Text>
              )
            )}
            {subtitleVisible && isPausing && (
              <Text style={styles.pauseHint}>
                ⏳ 等待复读... 点击 ▶ 立即继续
              </Text>
            )}
          </View>

          {/* 横屏控制栏 */}
          {controlsVisible && (
            <View style={styles.landscapeControls}>
              <View style={styles.segmentInfo}>
                <Text style={styles.segmentIndex}>
                  {currentIndex + 1}/{segments.length}
                </Text>
                <Text style={styles.segmentStats}>
                  👂 {(statsMap[currentSegment.id]?.listen_count ?? 0)} · 🎙 {(statsMap[currentSegment.id]?.read_count ?? 0)}
                </Text>
                <Text style={styles.segmentTime}>
                  {formatMs(currentSegment.start_ms)} - {formatMs(currentSegment.end_ms)}
                </Text>
              </View>
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
              <View style={styles.settingsRow}>
                <Pressable
                  style={[styles.settingChip, repeatCount !== 1 && styles.chipActive]}
                  onPress={cycleRepeat}
                >
                  <Text style={[styles.chipText, repeatCount !== 1 && styles.chipTextActive]}>
                    复读 {repeatLabel}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.settingChip, pauseMs !== 0 && styles.chipActive]}
                  onPress={cyclePause}
                >
                  <Text style={[styles.chipText, pauseMs !== 0 && styles.chipTextActive]}>
                    间隔 {pauseLabel}
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
                <Pressable
                  style={[styles.settingChip, alwaysShowSubtitle && styles.chipActive]}
                  onPress={() => setAlwaysShowSubtitle((v) => !v)}
                >
                  <Text style={[styles.chipText, alwaysShowSubtitle && styles.chipTextActive]}>
                    字幕{alwaysShowSubtitle ? '常驻' : '跟随'}
                  </Text>
                </Pressable>
                {!shadowPanelOpen && (
                  <Pressable
                    style={[styles.settingChip, styles.shadowChip]}
                    onPress={handleStartShadow}
                  >
                    <Text style={[styles.chipText, { fontWeight: '600' }]}>🎙 跟读</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.landscapeMarkRow}>
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
          )}

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
        </Pressable>
      ) : (
        <SafeAreaView style={styles.portraitContent} edges={['top', 'bottom']}>
          {/* 字幕区域 */}
          <Pressable style={styles.subtitleArea} onPress={toggleControls}>
            {subtitleVisible && subtitleMode === 'english' && (
              <Text style={styles.subtitleText}>{currentSegment.text}</Text>
            )}
            {subtitleVisible && subtitleMode === 'hidden' && (
              <Text style={[styles.subtitleText, styles.subtitleMuted]}>
                （盲听模式）
              </Text>
            )}
            {subtitleVisible && subtitleMode === 'answer' && (
              showAnswer ? (
                <Text style={styles.subtitleText}>{currentSegment.text}</Text>
              ) : (
                <Text style={[styles.subtitleText, styles.subtitleMuted]}>
                  👆 点击显示答案
                </Text>
              )
            )}
            {subtitleVisible && isPausing && (
              <Text style={styles.pauseHint}>
                ⏳ 等待复读... 点击 ▶ 立即继续
              </Text>
            )}
          </Pressable>

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

          {controlsVisible && (
            <>
              {/* 切片信息 */}
              <View style={styles.segmentInfo}>
                <Text style={styles.segmentIndex}>
                  第 {currentIndex + 1} / {segments.length} 句
                </Text>
                <Text style={styles.segmentStats}>
                  👂 {statsMap[currentSegment.id]?.listen_count ?? 0} 次听 · 🎙 {statsMap[currentSegment.id]?.read_count ?? 0} 次读
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
                {/* 复读次数 */}
                <Pressable
                  style={[styles.settingChip, repeatCount !== 1 && styles.chipActive]}
                  onPress={cycleRepeat}
                >
                  <Text style={[styles.chipText, repeatCount !== 1 && styles.chipTextActive]}>
                    复读 {repeatLabel}
                  </Text>
                </Pressable>
                {/* 停顿间隔 */}
                <Pressable
                  style={[styles.settingChip, pauseMs !== 0 && styles.chipActive]}
                  onPress={cyclePause}
                >
                  <Text style={[styles.chipText, pauseMs !== 0 && styles.chipTextActive]}>
                    间隔 {pauseLabel}
                  </Text>
                </Pressable>
                {/* 变速 */}
                <Pressable style={styles.settingChip} onPress={cycleSpeed}>
                  <Text style={styles.chipText}>{speed}×</Text>
                </Pressable>
                {/* 字幕模式 */}
                <Pressable
                  style={[styles.settingChip, subtitleMode !== 'english' && styles.chipActive]}
                  onPress={cycleSubtitleMode}
                >
                  <Text style={[styles.chipText, subtitleMode !== 'english' && styles.chipTextActive]}>
                    {subtitleLabels[subtitleMode]}
                  </Text>
                </Pressable>
                {/* 字幕常驻开关 */}
                <Pressable
                  style={[styles.settingChip, alwaysShowSubtitle && styles.chipActive]}
                  onPress={() => setAlwaysShowSubtitle((v) => !v)}
                >
                  <Text style={[styles.chipText, alwaysShowSubtitle && styles.chipTextActive]}>
                    字幕{alwaysShowSubtitle ? '常驻' : '跟随'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.settingsRow}>
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
            </>
          )}
        </SafeAreaView>
      )}
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

      {phase === 'recording' && (
        <Pressable style={styles.recordStopBtn} onPress={onStopRecording}>
          <Text style={styles.recordStopText}>⏹ 停止录音</Text>
        </Pressable>
      )}

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
  },
  portraitContent: {
    flex: 1,
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
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  goEditText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgDark,
    overflow: 'hidden',
  },
  landscapeVideoContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bgDark,
    overflow: 'hidden',
  },
  landscapeOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  landscapeSubtitleArea: {
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapeControls: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  landscapeMarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: spacing.sm,
  },
  video: {
    flex: 1,
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
    fontWeight: fontWeights.medium,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitleMuted: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
  },
  pauseHint: {
    color: colors.accent,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
  },
  shadowPanel: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  shadowStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shadowStatusText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  shadowCancel: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
  },
  shadowChip: {
    backgroundColor: 'rgba(245,158,11,0.6)',
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
    fontWeight: fontWeights.bold,
  },
  recordingList: {
    marginTop: spacing.sm,
  },
  recordingListTitle: {
    color: colors.textTertiary,
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
    color: colors.textTertiary,
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
    fontWeight: fontWeights.medium,
  },
  segmentTime: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontVariant: ['tabular-nums'],
  },
  segmentStats: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
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
    backgroundColor: 'rgba(99,102,241,0.6)',
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
    paddingVertical: spacing.xs,
  },
  settingChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipActive: {
    backgroundColor: 'rgba(99,102,241,0.5)',
  },
  chipText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  chipTextActive: {
    fontWeight: fontWeights.semibold,
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
    borderRadius: radius.full,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
    opacity: 0.7,
  },
  markBtnActive: {
    opacity: 1,
    transform: [{ scale: 1.05 }],
  },
  markBtnText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  closeBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
});
