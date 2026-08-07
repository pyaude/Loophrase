// practice_attempt 录音管理：存储/查询/删除录音记录

import type { SQLiteDatabase } from 'expo-sqlite';
import { createAttempt } from './practiceAttemptRepo';
import type { PracticeAttempt } from '../types';

/** 保存一次跟读录音 */
export async function saveShadowRecording(
  db: SQLiteDatabase,
  params: {
    segmentId: string;
    recordingUri: string;
    durationMs: number;
  },
): Promise<PracticeAttempt> {
  return createAttempt(db, {
    segmentId: params.segmentId,
    mode: 'shadow',
    result: null,
    recordingUri: params.recordingUri,
    durationMs: params.durationMs,
  });
}

/** 获取某个切片的所有跟读录音 */
export async function getRecordingsBySegment(
  db: SQLiteDatabase,
  segmentId: string,
): Promise<PracticeAttempt[]> {
  const rows = await db.getAllAsync<PracticeAttempt>(
    `SELECT * FROM practice_attempt
     WHERE segment_id = ? AND mode = 'shadow' AND recording_uri IS NOT NULL
     ORDER BY created_at DESC`,
    segmentId,
  );
  return rows;
}

/** 删除某条录音 */
export async function deleteRecording(
  db: SQLiteDatabase,
  attemptId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM practice_attempt WHERE id = ?`, attemptId);
}
