// SQLite 客户端：数据库初始化与单例

import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

const DB_NAME = 'loophrase.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * 获取数据库实例（单例），首次调用时自动建表。
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // 启用外键约束
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // 执行建表语句
  await db.execAsync(SCHEMA_SQL);

  // Migration: 旧库缺少 listen_count / read_count 列
  await db.execAsync(`
    ALTER TABLE review_schedule ADD COLUMN listen_count INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {});
  await db.execAsync(`
    ALTER TABLE review_schedule ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {});

  dbInstance = db;
  return db;
}

/**
 * 关闭数据库（主要用于测试）。
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}
