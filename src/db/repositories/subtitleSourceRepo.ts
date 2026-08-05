// subtitle_source Repository

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SubtitleSource, SubtitleType } from '../types';
import { generateId } from '../../utils/id';

export async function createSubtitleSource(
  db: SQLiteDatabase,
  params: {
    projectId: string;
    type: SubtitleType;
    language?: string;
    rawContent?: string | null;
  },
): Promise<SubtitleSource> {
  const source: SubtitleSource = {
    id: generateId(),
    project_id: params.projectId,
    type: params.type,
    language: params.language ?? 'en',
    version: 1,
    raw_content: params.rawContent ?? null,
    created_at: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO subtitle_source (id, project_id, type, language, version, raw_content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    source.id,
    source.project_id,
    source.type,
    source.language,
    source.version,
    source.raw_content,
    source.created_at,
  );

  return source;
}

export async function getSubtitleSourcesByProject(
  db: SQLiteDatabase,
  projectId: string,
): Promise<SubtitleSource[]> {
  return db.getAllAsync<SubtitleSource>(
    `SELECT * FROM subtitle_source WHERE project_id = ? ORDER BY version DESC`,
    projectId,
  );
}
