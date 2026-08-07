// 非对白检测：基于字幕空缺区间标记"建议跳过"（FR-N01/N04）

import type { Segment } from '../db/types';

type SkipRange = {
  startMs: number;
  endMs: number;
  type: 'intro' | 'outro' | 'music';
};

/** 无字幕空缺的最小时长（毫秒），低于此值不标记 */
const MIN_GAP_MS = 5000; // 5 秒

/**
 * 分析切片列表，找出可能需要跳过的非对白区间。
 * 规则（§8.1/FR-N01）：
 * - 媒体开头到第一个切片之间的空缺 → intro
 * - 最后一个切片到媒体结尾之间的空缺 → outro
 * - 相邻切片之间超过阈值的空缺 → music
 */
export function detectNonSpeechRanges(
  segments: Segment[],
  mediaDurationMs: number,
): SkipRange[] {
  const ranges: SkipRange[] = [];

  if (segments.length === 0) return ranges;

  // 排序
  const sorted = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // 片头
  if (first.start_ms >= MIN_GAP_MS) {
    ranges.push({
      startMs: 0,
      endMs: first.start_ms,
      type: 'intro',
    });
  }

  // 中间空缺
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].start_ms - sorted[i].end_ms;
    if (gap >= MIN_GAP_MS) {
      ranges.push({
        startMs: sorted[i].end_ms,
        endMs: sorted[i + 1].start_ms,
        type: 'music',
      });
    }
  }

  // 片尾
  if (mediaDurationMs - last.end_ms >= MIN_GAP_MS) {
    ranges.push({
      startMs: last.end_ms,
      endMs: mediaDurationMs,
      type: 'outro',
    });
  }

  return ranges;
}

/**
 * 为切片标记 skip_type。
 * 将落在非对白区间内的切片标记为对应的 skip_type。
 * 对白配乐片段不被标记（FR-N03）。
 */
export function applySkipSuggestions(
  segments: Segment[],
  ranges: SkipRange[],
): Segment[] {
  return segments.map((seg) => {
    for (const range of ranges) {
      // 如果切片完全落在非对白区间内，标记跳过
      if (seg.start_ms >= range.startMs && seg.end_ms <= range.endMs) {
        return { ...seg, skip_type: range.type };
      }
    }
    return seg;
  });
}
