// 字幕导入与创建服务
// 支持后续为已有项目添加字幕文件，或创建空白字幕

import { getDocumentAsync } from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getDatabase } from '../db/client';
import {
  createSubtitleSource,
  getSubtitleSourcesByProject,
  updateSubtitleRawContent,
  deleteSegmentsByProject,
  createSegmentsBatch,
} from '../db/repositories';
import { parseSubtitle, type ParsedCue } from './subtitleParser';
import { generateSegments } from './segmenter';
import type { MediaProject } from '../db/types';

const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'];

/** 选择字幕文件 */
export async function pickSubtitleFile(): Promise<DocumentPickerAsset | null> {
  const result = await getDocumentAsync({
    type: ['application/x-subrip', 'text/vtt', 'application/octet-stream', '*/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const name = asset.name.toLowerCase();
  if (!SUBTITLE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new Error('请选择 .srt 或 .vtt 字幕文件');
  }

  return asset;
}

/**
 * 为已有项目导入字幕文件
 * 如果项目已有字幕，会覆盖旧字幕并重新生成切片
 */
export async function importSubtitleForProject(
  projectId: string,
  subtitleAsset: DocumentPickerAsset,
  durationMs: number,
): Promise<{ segmentCount: number }> {
  const db = await getDatabase();

  // 1. 读取字幕内容
  const file = new File(subtitleAsset.uri);
  const content = await file.text();
  const ext = subtitleAsset.name.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';

  // 2. 检查是否已有字幕源
  const existing = await getSubtitleSourcesByProject(db, projectId);

  if (existing.length > 0) {
    // 更新已有字幕源
    await updateSubtitleRawContent(db, existing[0].id, content);
    // 删除旧切片
    await deleteSegmentsByProject(db, projectId);
  } else {
    // 创建新字幕源
    await createSubtitleSource(db, {
      projectId,
      type: ext,
      language: 'en',
      rawContent: content,
    });
  }

  // 3. 解析字幕并生成切片
  const cues = parseSubtitle(content, subtitleAsset.name);
  let segments = generateSegments(cues, projectId);

  // 4. 非对白检测
  if (segments.length > 0) {
    const { detectNonSpeechRanges, applySkipSuggestions } = await import('./nonSpeechDetector');
    const ranges = detectNonSpeechRanges(segments as any, durationMs);
    segments = applySkipSuggestions(segments as any, ranges) as typeof segments;
  }

  if (segments.length > 0) {
    await createSegmentsBatch(db, segments);
  }

  return { segmentCount: segments.length };
}

/**
 * 为项目创建空白字幕（用户手动在编辑器中添加内容）
 * 生成一个只包含整段视频时长的占位字幕
 */
export async function createEmptySubtitleForProject(
  project: MediaProject,
): Promise<void> {
  const db = await getDatabase();

  // 生成单条占位字幕：覆盖整个视频时长
  const placeholderCue: ParsedCue = {
    index: 0,
    startMs: 0,
    endMs: project.duration_ms,
    text: '点击编辑此文本...',
  };

  const srtContent = `1\n00:00:00,000 --> ${formatSrtTime(project.duration_ms)}\n${placeholderCue.text}`;

  // 检查是否已有字幕源
  const existing = await getSubtitleSourcesByProject(db, project.id);

  if (existing.length > 0) {
    await updateSubtitleRawContent(db, existing[0].id, srtContent);
    await deleteSegmentsByProject(db, project.id);
  } else {
    await createSubtitleSource(db, {
      projectId: project.id,
      type: 'srt',
      language: 'en',
      rawContent: srtContent,
    });
  }

  // 生成初始切片
  const segments = generateSegments([placeholderCue], project.id);
  if (segments.length > 0) {
    await createSegmentsBatch(db, segments);
  }
}

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}
