// 回声跟读 Hook（FR-P04）
// 管理完整流程：播放原句 → 静音留白 → 录音 → 回放

import { useState, useRef, useCallback } from 'react';
import {
  useAudioRecorder,
  RECORDING_OPTIONS,
  ensureRecordingPermission,
  prepareRecordingEnvironment,
  restorePlaybackEnvironment,
  saveRecording,
} from '../services/recordingManager';
import type { RecordingStatus } from 'expo-audio';
import { getDatabase } from '../db/client';
import { saveShadowRecording, getRecordingsBySegment } from '../db/repositories';
import { deleteMediaFile } from '../services/mediaManager';
import type { PracticeAttempt } from '../db/types';

export type ShadowPhase = 'idle' | 'playing_source' | 'waiting' | 'recording' | 'recorded';

export function useShadowRecorder(segmentId: string | undefined) {
  const [phase, setPhase] = useState<ShadowPhase>('idle');
  const [recordings, setRecordings] = useState<PracticeAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<ShadowPhase>('idle');

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status: RecordingStatus) => {
    if (status.mediaServicesDidReset && phaseRef.current === 'recording') {
      setError('音频服务被中断，请重试');
      setPhase('idle');
      phaseRef.current = 'idle';
    }
  });

  const updatePhase = useCallback((newPhase: ShadowPhase) => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }, []);

  /** 加载已有的录音列表 */
  const loadRecordings = useCallback(async () => {
    if (!segmentId) return;
    const db = await getDatabase();
    const list = await getRecordingsBySegment(db, segmentId);
    setRecordings(list);
  }, [segmentId]);

  /** 开始回声跟读流程 */
  const startShadowing = useCallback(async (): Promise<boolean> => {
    setError(null);
    const granted = await ensureRecordingPermission();
    if (!granted) {
      setError('需要录音权限才能使用跟读功能');
      return false;
    }
    await prepareRecordingEnvironment();
    await recorder.prepareToRecordAsync();
    updatePhase('playing_source');
    return true;
  }, [recorder, updatePhase]);

  /**
   * 原句播放完后，进入静音留白，
   * 然后开始录音。
   * @param silenceMs 留白时长（默认为原句时长）
   */
  const startRecordingAfterDelay = useCallback(
    async (silenceMs: number) => {
      updatePhase('waiting');

      // 等待留白
      await new Promise((resolve) => setTimeout(resolve, silenceMs));

      // 开始录音
      updatePhase('recording');
      recorder.record();
    },
    [recorder, updatePhase],
  );

  /** 停止录音并保存 */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (phaseRef.current !== 'recording') return null;

    await recorder.stop();
    const tempUri = recorder.uri;
    if (!tempUri) {
      updatePhase('idle');
      await restorePlaybackEnvironment();
      return null;
    }

    // 复制到持久存储
    const persistentUri = await saveRecording(tempUri);

    // 计算录音时长
    const durationSec = recorder.currentTime;
    const durationMs = Math.round(durationSec * 1000);

    // 保存到数据库
    if (segmentId) {
      const db = await getDatabase();
      await saveShadowRecording(db, {
        segmentId,
        recordingUri: persistentUri,
        durationMs,
      });
      await loadRecordings();
    }

    updatePhase('recorded');
    await restorePlaybackEnvironment();
    return persistentUri;
  }, [recorder, segmentId, loadRecordings, updatePhase]);

  /** 取消录音 */
  const cancelRecording = useCallback(async () => {
    if (phaseRef.current === 'recording') {
      await recorder.stop();
    }
    updatePhase('idle');
    await restorePlaybackEnvironment();
  }, [recorder, updatePhase]);

  /** 删除录音 */
  const deleteRecording = useCallback(
    async (attemptId: string, uri: string) => {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM practice_attempt WHERE id = ?`, attemptId);
      deleteMediaFile(uri);
      await loadRecordings();
    },
    [loadRecordings],
  );

  /** 重置到初始状态 */
  const reset = useCallback(() => {
    updatePhase('idle');
    setError(null);
  }, [updatePhase]);

  return {
    phase,
    error,
    recordings,
    startShadowing,
    startRecordingAfterDelay,
    stopRecording,
    cancelRecording,
    deleteRecording,
    loadRecordings,
    reset,
  };
}
