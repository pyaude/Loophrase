// 导入服务：整合文件选择、媒体复制、字幕解析、数据库写入

import { getDocumentAsync } from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getDatabase } from '../db/client';
import { createProject, createSubtitleSource, createSegmentsBatch } from '../db/repositories';
import { importMediaFile } from './mediaManager';
import { parseSubtitle } from './subtitleParser';
import { generateSegments } from './segmenter';
import type { MediaProject, SourceType } from '../db/types';

export type ImportResult = {
  project: MediaProject;
  segmentCount: number;
};

export type PickedFiles = {
  mediaAsset: DocumentPickerAsset;
  subtitleAsset?: DocumentPickerAsset;
};

const MEDIA_TYPES = [
  'video/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
];

const SUBTITLE_TYPES = [
  'application/x-subrip',
  'text/vtt',
  'application/octet-stream',
];

const MEDIA_EXTENSIONS = ['.mp4', '.mp3', '.m4a'];
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'];

/** 选择媒体文件和字幕文件 */
export async function pickFiles(): Promise<PickedFiles | null> {
  const result = await getDocumentAsync({
    type: [...MEDIA_TYPES, ...SUBTITLE_TYPES, '*/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  let mediaAsset: DocumentPickerAsset | undefined;
  let subtitleAsset: DocumentPickerAsset | undefined;

  for (const asset of result.assets) {
    const name = asset.name.toLowerCase();
    if (MEDIA_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      mediaAsset = asset;
    } else if (SUBTITLE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      subtitleAsset = asset;
    }
  }

  if (!mediaAsset) return null;

  return { mediaAsset, subtitleAsset };
}

/**
 * 完成导入流程（调用方需确保已获得授权确认）。
 * 1. 复制媒体到私有目录
 * 2. 解析字幕
 * 3. 创建项目 + 切片
 */
export async function performImport(
  files: PickedFiles,
  durationMs: number,
): Promise<ImportResult> {
  const db = await getDatabase();

  // 1. 复制媒体文件
  const localUri = await importMediaFile(files.mediaAsset.uri);

  // 2. 判断媒体类型
  const ext = files.mediaAsset.name.split('.').pop()?.toLowerCase() ?? '';
  const sourceType: SourceType = ext === 'mp4' ? 'video' : 'audio';

  // 3. 创建项目
  const project = await createProject(db, {
    title: files.mediaAsset.name.replace(/\.[^.]+$/, ''),
    localUri,
    durationMs,
    sourceType,
  });

  // 4. 解析字幕（如果有）
  let subtitleContent: string | null = null;
  if (files.subtitleAsset) {
    const file = new File(files.subtitleAsset.uri);
    subtitleContent = await file.text();

    await createSubtitleSource(db, {
      projectId: project.id,
      type: files.subtitleAsset.name.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt',
      language: 'en',
      rawContent: subtitleContent,
    });
  }

  // 5. 生成切片
  let segmentCount = 0;
  if (subtitleContent) {
    const cues = parseSubtitle(subtitleContent, files.subtitleAsset?.name);
    let segments = generateSegments(cues, project.id);

    // 检测非对白区间并应用建议（FR-N01）
    if (segments.length > 0) {
      const { detectNonSpeechRanges, applySkipSuggestions } = await import('./nonSpeechDetector');
      const ranges = detectNonSpeechRanges(
        segments as any,
        durationMs,
      );
      segments = applySkipSuggestions(segments as any, ranges) as typeof segments;
    }

    if (segments.length > 0) {
      await createSegmentsBatch(db, segments);
      segmentCount = segments.length;
    }
  }

  return { project, segmentCount };
}
