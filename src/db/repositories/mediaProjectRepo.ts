// media_project Repository

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MediaProject, SourceType } from '../types';
import { generateId } from '../../utils/id';

// SQLite 中布尔值以 0/1 存储
type MediaProjectRow = Omit<MediaProject, 'has_audio'> & { has_audio: number };

function mapRow(row: MediaProjectRow): MediaProject {
  return { ...row, has_audio: !!row.has_audio };
}

export async function createProject(
  db: SQLiteDatabase,
  params: {
    title: string;
    localUri: string;
    durationMs: number;
    sourceType: SourceType;
    hasAudio?: boolean;
  },
): Promise<MediaProject> {
  const now = Date.now();
  const project: MediaProject = {
    id: generateId(),
    title: params.title,
    local_uri: params.localUri,
    duration_ms: params.durationMs,
    source_type: params.sourceType,
    has_audio: params.hasAudio ?? true,
    created_at: now,
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO media_project (id, title, local_uri, duration_ms, source_type, has_audio, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    project.id,
    project.title,
    project.local_uri,
    project.duration_ms,
    project.source_type,
    project.has_audio ? 1 : 0,
    project.created_at,
    project.updated_at,
  );

  return project;
}

export async function getProjectById(
  db: SQLiteDatabase,
  id: string,
): Promise<MediaProject | null> {
  const row = await db.getFirstAsync<MediaProjectRow>(
    `SELECT * FROM media_project WHERE id = ?`,
    id,
  );
  if (!row) return null;
  return mapRow(row);
}

export async function getAllProjects(db: SQLiteDatabase): Promise<MediaProject[]> {
  const rows = await db.getAllAsync<MediaProjectRow>(
    `SELECT * FROM media_project ORDER BY updated_at DESC`,
  );
  return rows.map(mapRow);
}

export async function updateProject(
  db: SQLiteDatabase,
  id: string,
  fields: Partial<Pick<MediaProject, 'title' | 'duration_ms' | 'updated_at'>>,
): Promise<void> {
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (fields.title !== undefined) {
    updates.push('title = ?');
    values.push(fields.title);
  }
  if (fields.duration_ms !== undefined) {
    updates.push('duration_ms = ?');
    values.push(fields.duration_ms);
  }
  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  await db.runAsync(
    `UPDATE media_project SET ${updates.join(', ')} WHERE id = ?`,
    ...values,
  );
}

export async function deleteProject(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM media_project WHERE id = ?`, id);
}
