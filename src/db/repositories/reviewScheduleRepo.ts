// review_schedule Repository：间隔复习调度（§8.2）

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ReviewSchedule, LearnState } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 默认复习间隔：1、3、7、14、30 天（§5.1 FR-R02）
 * "没听懂"和"没说顺" → 次日到期
 * "已掌握" → 按 3、7、14、30 天递进
 */
const MASTERY_INTERVALS = [3, 7, 14, 30];

type SegmentRow = {
  segment_id: string;
  state: string;
  due_at: number;
  interval_days: number;
  review_count: number;
  updated_at: number;
};

function mapRow(row: SegmentRow): ReviewSchedule {
  return {
    segment_id: row.segment_id,
    state: row.state as LearnState,
    due_at: row.due_at,
    interval_days: row.interval_days,
    review_count: row.review_count,
    updated_at: row.updated_at,
  };
}

/** 确保切片有复习记录，首次进入时 new → practicing */
export async function ensureReviewSchedule(
  db: SQLiteDatabase,
  segmentId: string,
): Promise<ReviewSchedule> {
  const existing = await db.getFirstAsync<SegmentRow>(
    `SELECT * FROM review_schedule WHERE segment_id = ?`,
    segmentId,
  );

  if (existing) return mapRow(existing);

  const now = Date.now();
  const schedule: ReviewSchedule = {
    segment_id: segmentId,
    state: 'new',
    due_at: now,
    interval_days: 0,
    review_count: 0,
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO review_schedule (segment_id, state, due_at, interval_days, review_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    schedule.segment_id,
    schedule.state,
    schedule.due_at,
    schedule.interval_days,
    schedule.review_count,
    schedule.updated_at,
  );

  return schedule;
}

/**
 * 标记练习结果，更新复习状态（§8.2）。
 * - "没听懂"/"没说顺" → practicing，次日到期
 * - "已掌握" → due/mastered，按递进间隔
 */
export async function markResult(
  db: SQLiteDatabase,
  segmentId: string,
  result: 'understood' | 'not_smooth' | 'mastered',
): Promise<ReviewSchedule> {
  await ensureReviewSchedule(db, segmentId);
  const now = Date.now();

  if (result === 'understood' || result === 'not_smooth') {
    // 次日到期
    await db.runAsync(
      `UPDATE review_schedule
       SET state = 'practicing', due_at = ?, interval_days = 1, updated_at = ?
       WHERE segment_id = ?`,
      now + DAY_MS,
      now,
      segmentId,
    );
  } else {
    // mastered：按递进间隔
    const current = await db.getFirstAsync<SegmentRow>(
      `SELECT * FROM review_schedule WHERE segment_id = ?`,
      segmentId,
    );
    const reviewCount = current?.review_count ?? 0;
    const intervalIndex = Math.min(reviewCount, MASTERY_INTERVALS.length - 1);
    const intervalDays = MASTERY_INTERVALS[intervalIndex];
    const newState: LearnState =
      reviewCount >= MASTERY_INTERVALS.length - 1 ? 'mastered' : 'due';

    await db.runAsync(
      `UPDATE review_schedule
       SET state = ?, due_at = ?, interval_days = ?, review_count = review_count + 1, updated_at = ?
       WHERE segment_id = ?`,
      newState,
      now + intervalDays * DAY_MS,
      intervalDays,
      now,
      segmentId,
    );
  }

  const updated = await db.getFirstAsync<SegmentRow>(
    `SELECT * FROM review_schedule WHERE segment_id = ?`,
    segmentId,
  );
  return mapRow(updated!);
}

/** 获取所有到期的切片（用于今日页复习队列） */
export async function getDueSegments(
  db: SQLiteDatabase,
  options?: { projectId?: string; limit?: number },
): Promise<Array<{ segment_id: string; project_id: string; text: string; start_ms: number; end_ms: number }>> {
  const now = Date.now();
  let query = `
    SELECT rs.segment_id, s.project_id, s.text, s.start_ms, s.end_ms
    FROM review_schedule rs
    JOIN segment s ON rs.segment_id = s.id
    WHERE rs.due_at <= ? AND rs.state IN ('practicing', 'due')
  `;
  const params: (string | number)[] = [now];

  if (options?.projectId) {
    query += ` AND s.project_id = ?`;
    params.push(options.projectId);
  }

  query += ` ORDER BY rs.due_at ASC`;

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  return db.getAllAsync(query, ...params);
}

/** 统计各状态的切片数量 */
export async function getReviewStats(db: SQLiteDatabase): Promise<{
  dueCount: number;
  newCount: number;
  practicingCount: number;
  masteredCount: number;
}> {
  const now = Date.now();
  const due = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM review_schedule WHERE due_at <= ? AND state IN ('practicing', 'due')`,
    now,
  );
  const newCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM review_schedule WHERE state = 'new'`,
  );
  const practicing = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM review_schedule WHERE state = 'practicing'`,
  );
  const mastered = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM review_schedule WHERE state = 'mastered'`,
  );

  return {
    dueCount: due?.count ?? 0,
    newCount: newCount?.count ?? 0,
    practicingCount: practicing?.count ?? 0,
    masteredCount: mastered?.count ?? 0,
  };
}
