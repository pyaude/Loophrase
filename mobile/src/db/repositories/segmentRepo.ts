// segment Repository

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Segment, SegmentSource, SegmentStatus, SkipType } from '../types';
import { generateId } from '../../utils/id';

type SegmentRow = Omit<Segment, 'skip_type'> & { skip_type: string | null };

function mapRow(row: SegmentRow): Segment {
  return {
    ...row,
    skip_type: (row.skip_type as SkipType) ?? null,
  };
}

export async function createSegment(
  db: SQLiteDatabase,
  params: {
    projectId: string;
    orderIndex: number;
    startMs: number;
    endMs: number;
    text: string;
    source: SegmentSource;
    confidence?: number | null;
    skipType?: SkipType;
    status?: SegmentStatus;
  },
): Promise<Segment> {
  const now = Date.now();
  const segment: Segment = {
    id: generateId(),
    project_id: params.projectId,
    order_index: params.orderIndex,
    start_ms: params.startMs,
    end_ms: params.endMs,
    text: params.text,
    confidence: params.confidence ?? null,
    skip_type: params.skipType ?? null,
    source: params.source,
    status: params.status ?? 'pending',
    created_at: now,
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO segment (id, project_id, order_index, start_ms, end_ms, text, confidence, skip_type, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    segment.id,
    segment.project_id,
    segment.order_index,
    segment.start_ms,
    segment.end_ms,
    segment.text,
    segment.confidence,
    segment.skip_type,
    segment.source,
    segment.status,
    segment.created_at,
    segment.updated_at,
  );

  return segment;
}

/** 批量创建切片（事务） */
export async function createSegmentsBatch(
  db: SQLiteDatabase,
  segments: Array<Omit<Segment, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const seg of segments) {
      await db.runAsync(
        `INSERT INTO segment (id, project_id, order_index, start_ms, end_ms, text, confidence, skip_type, source, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        generateId(),
        seg.project_id,
        seg.order_index,
        seg.start_ms,
        seg.end_ms,
        seg.text,
        seg.confidence,
        seg.skip_type,
        seg.source,
        seg.status,
        now,
        now,
      );
    }
  });
}

export async function getSegmentsByProject(
  db: SQLiteDatabase,
  projectId: string,
): Promise<Segment[]> {
  const rows = await db.getAllAsync<SegmentRow>(
    `SELECT * FROM segment WHERE project_id = ? ORDER BY order_index ASC`,
    projectId,
  );
  return rows.map(mapRow);
}

export async function getSegmentById(
  db: SQLiteDatabase,
  id: string,
): Promise<Segment | null> {
  const row = await db.getFirstAsync<SegmentRow>(
    `SELECT * FROM segment WHERE id = ?`,
    id,
  );
  return row ? mapRow(row) : null;
}

export async function updateSegmentTimes(
  db: SQLiteDatabase,
  id: string,
  startMs: number,
  endMs: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE segment SET start_ms = ?, end_ms = ?, updated_at = ? WHERE id = ?`,
    startMs,
    endMs,
    Date.now(),
    id,
  );
}

export async function updateSegmentText(
  db: SQLiteDatabase,
  id: string,
  text: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE segment SET text = ?, updated_at = ? WHERE id = ?`,
    text,
    Date.now(),
    id,
  );
}

export async function updateSegmentSkipType(
  db: SQLiteDatabase,
  id: string,
  skipType: SkipType,
): Promise<void> {
  await db.runAsync(
    `UPDATE segment SET skip_type = ?, updated_at = ? WHERE id = ?`,
    skipType,
    Date.now(),
    id,
  );
}

/** 合并两个相邻切片：保留第一个的 start，使用第二个的 end，文本拼接 */
export async function mergeSegments(
  db: SQLiteDatabase,
  firstId: string,
  secondId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const first = await getSegmentById(db, firstId);
    const second = await getSegmentById(db, secondId);
    if (!first || !second) return;

    // 扩展第一个切片
    await db.runAsync(
      `UPDATE segment SET end_ms = ?, text = ?, updated_at = ? WHERE id = ?`,
      second.end_ms,
      `${first.text} ${second.text}`,
      Date.now(),
      firstId,
    );

    // 将第二个切片的练习记录迁移到第一个
    await db.runAsync(
      `UPDATE practice_attempt SET segment_id = ? WHERE segment_id = ?`,
      firstId,
      secondId,
    );

    // 删除复习记录和第二个切片
    await db.runAsync(`DELETE FROM review_schedule WHERE segment_id = ?`, secondId);
    await db.runAsync(`DELETE FROM segment WHERE id = ?`, secondId);
  });
}

/** 重新排序（删除切片后重排 order_index） */
export async function reorderSegments(
  db: SQLiteDatabase,
  projectId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE segment
     SET order_index = (
       SELECT COUNT(*) FROM segment s2
       WHERE s2.project_id = segment.project_id
         AND s2.start_ms < segment.start_ms
     )
     WHERE project_id = ?`,
    projectId,
  );
}
