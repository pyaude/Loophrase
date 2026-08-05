// 匿名化事件埋点系统（§11.2 关键事件）
// MVP 使用轻量本地实现，可后续接入 Sentry/Amplitude

type EventName =
  | 'project_imported'
  | 'subtitle_parsed'
  | 'transcription_requested'
  | 'transcription_completed'
  | 'segment_edited'
  | 'non_speech_marked'
  | 'loop_started'
  | 'shadow_started'
  | 'recording_saved'
  | 'blind_listen_completed'
  | 'review_completed'
  | 'sync_started'
  | 'sync_failed';

type EventPayload = Record<string, string | number | boolean | null | undefined>;

// 事件缓冲
const eventBuffer: Array<{
  name: EventName;
  payload?: EventPayload;
  timestamp: number;
}> = [];

const MAX_BUFFER = 200;

/**
 * 记录一个事件。匿名化，不含用户内容。
 */
export function trackEvent(name: EventName, payload?: EventPayload): void {
  eventBuffer.push({
    name,
    payload,
    timestamp: Date.now(),
  });

  if (eventBuffer.length > MAX_BUFFER) {
    eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER);
  }

  // 开发模式输出
  if (__DEV__) {
    console.log(`[analytics] ${name}`, payload ?? '');
  }
}

/**
 * 获取所有缓冲事件（用于批量上报）。
 */
export function getBufferedEvents() {
  return [...eventBuffer];
}

/** 清空已上报的事件 */
export function clearBufferedEvents(): void {
  eventBuffer.splice(0, eventBuffer.length);
}
