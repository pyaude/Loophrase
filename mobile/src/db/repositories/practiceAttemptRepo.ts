// practice_attempt Repository

import type { SQLiteDatabase } from 'expo-sqlite';
import type { PracticeAttempt, PracticeMode, PracticeResult } from '../types';
import { generateId } from '../../utils/id';

export async function createAttempt(
  db: SQLiteDatabase,
  params: {
    segmentId: string;
    mode: PracticeMode;
    result?: PracticeResult;
    recordingUri?: string | null;
    durationMs?: number | null;
  },
): Promise<PracticeAttempt> {
  const attempt: PracticeAttempt = {
    id: generateId(),
    segment_id: params.segmentId,
    mode: params.mode,
    result: params.result ?? null,
    recording_uri: params.recordingUri ?? null,
    duration_ms: params.durationMs ?? null,
    created_at: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO practice_attempt (id, segment_id, mode, result, recording_uri, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    attempt.id,
    attempt.segment_id,
    attempt.mode,
    attempt.result,
    attempt.recording_uri,
    attempt.duration_ms,
    attempt.created_at,
  );

  return attempt;
}

export async function getAttemptsBySegment(
  db: SQLiteDatabase,
  segmentId: string,
): Promise<PracticeAttempt[]> {
  return db.getAllAsync<PracticeAttempt>(
    `SELECT * FROM practice_attempt WHERE segment_id = ? ORDER BY created_at DESC`,
    segmentId,
  );
}

/** 统计有效练习时长（FR-R04：排除片头/片尾/音乐） */
export async function getEffectivePracticeDurationMs(
  db: SQLiteDatabase,
  sinceMs: number,
): Promise<number> {
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(pa.duration_ms), 0) as total
     FROM practice_attempt pa
     JOIN segment s ON pa.segment_id = s.id
     WHERE pa.created_at >= ? AND s.skip_type IS NULL`,
    sinceMs,
  );
  return result?.total ?? 0;
}
