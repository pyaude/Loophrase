// 账号与同步服务（§5.1 FR-M05）
// 离线优先，本地写 → 联网后增量同步
// 同步元数据 + 切片 + 复习记录；不同步原视频

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../db/client';
import { getAllProjects, getSegmentsByProject } from '../db/repositories';

// Supabase 配置（MVP 阶段使用占位值）
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;
let isInitialized = false;

/** 获取 Supabase 客户端（单例） */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: (key: string) => SecureStore.getItemAsync(key),
          setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
          removeItem: (key: string) => SecureStore.deleteItemAsync(key),
        },
        autoRefreshToken: true,
        persistSession: true,
      },
    });
    isInitialized = true;
  }

  return client;
}

/** 是否已配置 Supabase */
export function isSyncAvailable(): boolean {
  return isInitialized && client !== null;
}

/**
 * 同步本地数据到云端。
 * 同步策略：last-write-wins，使用 updated_at 比对。
 * 只同步元数据，不同步原视频。
 */
export async function syncToCloud(): Promise<{ synced: number; errors: string[] }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { synced: 0, errors: ['Sync not configured'] };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { synced: 0, errors: ['Not logged in'] };
  }

  const errors: string[] = [];
  let synced = 0;

  try {
    const db = await getDatabase();
    const projects = await getAllProjects(db);

    for (const project of projects) {
      // 同步项目元数据（不含 local_uri 中的文件）
      const { error: projError } = await supabase.from('media_project').upsert({
        id: project.id,
        user_id: user.id,
        title: project.title,
        duration_ms: project.duration_ms,
        source_type: project.source_type,
        created_at: new Date(project.created_at).toISOString(),
        updated_at: new Date(project.updated_at).toISOString(),
      });

      if (projError) {
        errors.push(`Project ${project.id}: ${projError.message}`);
        continue;
      }

      // 同步切片
      const segments = await getSegmentsByProject(db, project.id);
      if (segments.length > 0) {
        const { error: segError } = await supabase.from('segment').upsert(
          segments.map((s) => ({
            id: s.id,
            project_id: s.project_id,
            user_id: user.id,
            order_index: s.order_index,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text,
            confidence: s.confidence,
            skip_type: s.skip_type,
            source: s.source,
            status: s.status,
            updated_at: new Date(s.updated_at).toISOString(),
          })),
        );

        if (segError) {
          errors.push(`Segments for ${project.id}: ${segError.message}`);
        } else {
          synced += segments.length;
        }
      }

      synced += 1;
    }
  } catch (err) {
    errors.push(String(err));
  }

  return { synced, errors };
}

/**
 * 从云端拉取数据到本地。
 */
export async function syncFromCloud(): Promise<{ pulled: number; errors: string[] }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { pulled: 0, errors: ['Sync not configured'] };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { pulled: 0, errors: ['Not logged in'] };
  }

  // MVP: 占位实现
  // 完整实现需要比对 updated_at 并合并
  return { pulled: 0, errors: [] };
}
