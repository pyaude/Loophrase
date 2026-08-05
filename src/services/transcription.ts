// 转写服务（§9.3）
// TranscriptionProvider 抽象层 + 统一 TranscriptionResult 类型
// 可替换 Provider（Whisper / 其他）

/** 统一转写结果类型（§9.3） */
export type TranscriptionResult = {
  language: 'en';
  segments: Array<{
    startMs: number;
    endMs: number;
    text: string;
    confidence?: number;
    words?: Array<{
      text: string;
      startMs: number;
      endMs: number;
      confidence?: number;
    }>;
  }>;
  nonSpeechRanges?: Array<{
    startMs: number;
    endMs: number;
    type: 'music' | 'silence';
  }>;
};

/** 转写 Provider 接口 */
export interface TranscriptionProvider {
  name: string;
  /**
   * 提交音轨进行转写。
   * @param audioUri 本地音轨文件 URI
   * @returns 转写结果
   */
  transcribe(audioUri: string): Promise<TranscriptionResult>;
}

/** 低置信度阈值 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * 转写服务：管理提交、状态和结果处理。
 */
export class TranscriptionService {
  constructor(private provider: TranscriptionProvider) {}

  /**
   * 执行完整转写流程。
   * 1. 通过 provider 转写音轨
   * 2. 返回带置信度标注的结果
   */
  async transcribe(audioUri: string): Promise<TranscriptionResult> {
    const result = await this.provider.transcribe(audioUri);
    return result;
  }

  /** 判断某个 segment 是否为低置信度 */
  isLowConfidence(confidence: number | undefined): boolean {
    return confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
  }
}

// ---- Mock Provider（用于 MVP 开发/测试） ----

export class MockTranscriptionProvider implements TranscriptionProvider {
  name = 'mock';

  async transcribe(_audioUri: string): Promise<TranscriptionResult> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      language: 'en',
      segments: [
        {
          startMs: 1000,
          endMs: 4000,
          text: 'Hello, welcome to the show.',
          confidence: 0.95,
        },
        {
          startMs: 4500,
          endMs: 8000,
          text: 'Today we are going to talk about language learning.',
          confidence: 0.88,
        },
      ],
      nonSpeechRanges: [
        { startMs: 0, endMs: 1000, type: 'silence' },
      ],
    };
  }
}
