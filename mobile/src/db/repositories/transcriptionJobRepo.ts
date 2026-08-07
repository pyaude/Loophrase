// transcription_job Repository

import type { SQLiteDatabase } from 'expo-sqlite';
import type { TranscriptionJob, TranscriptionJobStatus } from '../types';
import { generateId } from '../../utils/id';

export async function createTranscriptionJob(
  db: SQLiteDatabase,
  params: {
    projectId: string;
    provider: string;
  },
): Promise<TranscriptionJob> {
  const now = Date.now();
  const job: TranscriptionJob = {
    id: generateId(),
    project_id: params.projectId,
    status: 'pending',
    expires_at: now + 24 * 60 * 60 * 1000, // 24h 后过期
    provider: params.provider,
    created_at: now,
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO transcription_job (id, project_id, status, expires_at, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    job.id,
    job.project_id,
    job.status,
    job.expires_at,
    job.provider,
    job.created_at,
    job.updated_at,
  );

  return job;
}

export async function updateJobStatus(
  db: SQLiteDatabase,
  jobId: string,
  status: TranscriptionJobStatus,
): Promise<void> {
  await db.runAsync(
    `UPDATE transcription_job SET status = ?, updated_at = ? WHERE id = ?`,
    status,
    Date.now(),
    jobId,
  );
}

export async function getJobsByProject(
  db: SQLiteDatabase,
  projectId: string,
): Promise<TranscriptionJob[]> {
  return db.getAllAsync<TranscriptionJob>(
    `SELECT * FROM transcription_job WHERE project_id = ? ORDER BY created_at DESC`,
    projectId,
  );
}

/** 清理已过期或已完成的任务记录 */
export async function cleanupExpiredJobs(db: SQLiteDatabase): Promise<number> {
  const now = Date.now();
  const result = await db.runAsync(
    `DELETE FROM transcription_job WHERE expires_at IS NOT NULL AND expires_at < ?`,
    now,
  );
  return result.changes;
}
