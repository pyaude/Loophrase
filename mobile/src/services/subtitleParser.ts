// SRT / VTT 字幕解析器
// 解析为统一的 ParsedCue 格式：{ index, startMs, endMs, text }

export interface ParsedCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** 解析时间戳字符串为毫秒，支持 SRT (00:01:23,456) 和 VTT (00:01:23.456 / 01:23.456) */
function parseTimestamp(ts: string): number {
  const cleaned = ts.trim().replace(',', '.');
  const parts = cleaned.split(':');

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (
      parseInt(h, 10) * 3600000 +
      parseInt(m, 10) * 60000 +
      parseFloat(s) * 1000
    );
  } else if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m, 10) * 60000 + parseFloat(s) * 1000;
  } else {
    return parseFloat(cleaned) * 1000;
  }
}

/** 解析 SRT 文件内容 */
export function parseSRT(content: string): ParsedCue[] {
  const cues: ParsedCue[] = [];
  // SRT 块以空行分隔
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // 第一行可能是序号，也可能是时间轴
    let timeLineIdx = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIdx = 1;
    }

    const timeLine = lines[timeLineIdx];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/,
    );
    if (!match) continue;

    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);
    const text = lines
      .slice(timeLineIdx + 1)
      .join('\n')
      .trim();

    if (text) {
      cues.push({
        index: cues.length,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

/** 解析 VTT 文件内容 */
export function parseVTT(content: string): ParsedCue[] {
  const cues: ParsedCue[] = [];
  // 移除 WEBVTT 头部和元数据
  const body = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^WEBVTT.*\n/, '')
    .trim();

  const blocks = body.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 1) continue;

    // 跳过 STYLE / NOTE / REGION 块
    const firstLine = lines[0].trim().toUpperCase();
    if (firstLine.startsWith('STYLE') || firstLine.startsWith('NOTE') || firstLine.startsWith('REGION')) {
      continue;
    }

    // 第一行可能是 cue 标识符（如 "cue-1"），也可能是时间轴
    let timeLineIdx = 0;
    if (!lines[0].includes('-->')) {
      timeLineIdx = 1;
    }

    if (timeLineIdx >= lines.length) continue;

    const timeLine = lines[timeLineIdx];
    const match = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}\.\d{3}|\d+\.\d{3})s?\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}\.\d{3}|\d+\.\d{3})s?/,
    );
    if (!match) continue;

    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);

    // 移除 VTT 的 <c>、<v>、<b> 等 inline 标签
    const text = lines
      .slice(timeLineIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (text) {
      cues.push({
        index: cues.length,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

/** 自动识别并解析字幕文件 */
export function parseSubtitle(content: string, filename?: string): ParsedCue[] {
  const ext = filename?.split('.').pop()?.toLowerCase();

  if (ext === 'srt') return parseSRT(content);
  if (ext === 'vtt') return parseVTT(content);

  // 自动检测
  const trimmed = content.trim();
  if (trimmed.startsWith('WEBVTT')) {
    return parseVTT(content);
  }
  return parseSRT(content);
}
