// 数据库实体类型定义（对应 §9.4 核心数据实体）

export type SourceType = 'video' | 'audio';
export type SubtitleType = 'srt' | 'vtt' | 'transcription';
export type SegmentSource = 'subtitle' | 'transcription' | 'manual';
export type SegmentStatus = 'pending' | 'confirmed';
export type SkipType = 'intro' | 'outro' | 'music' | null;

/** 学习状态（§8.2） */
export type LearnState = 'new' | 'practicing' | 'due' | 'mastered';

/** 练习模式 */
export type PracticeMode = 'blind_listen' | 'shadow';

/** 自评结果 */
export type PracticeResult = 'understood' | 'not_smooth' | 'mastered' | null;

export interface MediaProject {
  id: string;
  title: string;
  local_uri: string;
  duration_ms: number;
  source_type: SourceType;
  has_audio: boolean;
  created_at: number;
  updated_at: number;
}

export interface SubtitleSource {
  id: string;
  project_id: string;
  type: SubtitleType;
  language: string;
  version: number;
  raw_content: string | null;
  created_at: number;
}

export interface Segment {
  id: string;
  project_id: string;
  order_index: number;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  skip_type: SkipType;
  source: SegmentSource;
  status: SegmentStatus;
  created_at: number;
  updated_at: number;
}

export interface PracticeAttempt {
  id: string;
  segment_id: string;
  mode: PracticeMode;
  result: PracticeResult;
  recording_uri: string | null;
  duration_ms: number | null;
  created_at: number;
}

export interface ReviewSchedule {
  segment_id: string;
  state: LearnState;
  due_at: number;
  interval_days: number;
  review_count: number;
  updated_at: number;
}

/** 转写任务状态 */
export type TranscriptionJobStatus =
  | 'pending'
  | 'extracting'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed';

export interface TranscriptionJob {
  id: string;
  project_id: string;
  status: TranscriptionJobStatus;
  expires_at: number | null;
  provider: string;
  created_at: number;
  updated_at: number;
}
