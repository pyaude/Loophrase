// 智能断句：将字幕 cue 转换为练习切片
// 规则（FR-S01/S02）：
// 1. 默认每条字幕行 → 一个 segment
// 2. 时长 1-12 秒的保留
// 3. >12 秒的长句按标点和连接词拆分为意群
// 4. <1 秒的过短片段与相邻合并

import type { ParsedCue } from './subtitleParser';
import type { Segment } from '../db/types';

const MAX_SEGMENT_MS = 12_000;
const MIN_SEGMENT_MS = 1_000;

// 用于拆分长句的标点和连接词
const SPLIT_PATTERNS = [
  /([.!?;:]\s+)/g,       // 句末标点
  /(,\s+)/g,              // 逗号
  /(\s+but\s+)/gi,        // 连词
  /(\s+and\s+)/gi,
  /(\s+because\s+)/gi,
  /(\s+so\s+)/gi,
  /(\s+which\s+)/gi,
  /(\s+when\s+)/gi,
  /(\s+--\s*)/g,          // 破折号
];

type SplitPart = {
  text: string;
  /** 在原文中的近似比例位置 0-1 */
  ratio: number;
};

/**
 * 尝试将文本拆分为多个意群。
 * 返回 [{text, ratio}]，ratio 表示该段文本在原文中的结束比例。
 */
function splitText(text: string): SplitPart[] {
  for (const pattern of SPLIT_PATTERNS) {
    const parts = text.split(pattern).filter((s) => s.trim().length > 0);
    if (parts.length >= 2) {
      const result: SplitPart[] = [];
      let charCount = 0;
      const totalChars = text.length;

      for (const part of parts) {
        charCount += part.length;
        const trimmed = part.trim();
        if (trimmed) {
          result.push({
            text: trimmed,
            ratio: charCount / totalChars,
          });
        }
      }

      if (result.length >= 2) return result;
    }
  }

  return [{ text: text.trim(), ratio: 1 }];
}

/** 生成练习切片 */
export function generateSegments(
  cues: ParsedCue[],
  projectId: string,
): Omit<Segment, 'id' | 'created_at' | 'updated_at'>[] {
  const rawSegments: Array<{
    startMs: number;
    endMs: number;
    text: string;
  }> = [];

  for (const cue of cues) {
    const duration = cue.endMs - cue.startMs;

    if (duration > MAX_SEGMENT_MS) {
      // 长句拆分
      const parts = splitText(cue.text);
      let prevMs = cue.startMs;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partEndMs =
          i === parts.length - 1
            ? cue.endMs
            : cue.startMs + Math.round((cue.endMs - cue.startMs) * part.ratio);

        rawSegments.push({
          startMs: prevMs,
          endMs: partEndMs,
          text: part.text,
        });
        prevMs = partEndMs;
      }
    } else {
      rawSegments.push({
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
      });
    }
  }

  // 合并过短片段（<1 秒）
  const merged: typeof rawSegments = [];
  for (const seg of rawSegments) {
    const duration = seg.endMs - seg.startMs;
    if (duration < MIN_SEGMENT_MS && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.endMs = seg.endMs;
      prev.text = `${prev.text} ${seg.text}`;
    } else {
      merged.push({ ...seg });
    }
  }

  // 转换为 Segment 格式
  const now = Date.now();
  return merged.map((seg, index) => ({
    project_id: projectId,
    order_index: index,
    start_ms: seg.startMs,
    end_ms: seg.endMs,
    text: seg.text,
    confidence: null,
    skip_type: null,
    source: 'subtitle' as const,
    status: 'confirmed' as const,
    // id, created_at, updated_at 由 repository 填充
  })) as Omit<Segment, 'id' | 'created_at' | 'updated_at'>[];
}
