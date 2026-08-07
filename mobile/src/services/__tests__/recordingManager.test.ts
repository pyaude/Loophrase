// recordingManager 单元测试
// 覆盖：权限请求、录音/播放环境切换、RECORDING_OPTIONS、re-export

import {
  ensureRecordingPermission,
  prepareRecordingEnvironment,
  restorePlaybackEnvironment,
  RECORDING_OPTIONS,
  RecordingPresets,
} from '../recordingManager';

// Mock expo-audio
jest.mock('expo-audio');
const { requestRecordingPermissionsAsync, setAudioModeAsync } = require('expo-audio');

describe('recordingManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================
  // ensureRecordingPermission
  // ============================
  describe('ensureRecordingPermission', () => {
    it('授权成功时返回 true', async () => {
      requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
      const result = await ensureRecordingPermission();
      expect(result).toBe(true);
      expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('授权被拒时返回 false', async () => {
      requestRecordingPermissionsAsync.mockResolvedValue({ granted: false });
      const result = await ensureRecordingPermission();
      expect(result).toBe(false);
    });

    it('抛出异常时不吞掉错误', async () => {
      requestRecordingPermissionsAsync.mockRejectedValue(new Error('Permission API error'));
      await expect(ensureRecordingPermission()).rejects.toThrow('Permission API error');
    });
  });

  // ============================
  // prepareRecordingEnvironment
  // ============================
  describe('prepareRecordingEnvironment', () => {
    it('设置 allowsRecording=true, interruptionMode=doNotMix', async () => {
      setAudioModeAsync.mockResolvedValue(undefined);
      await prepareRecordingEnvironment();

      expect(setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
      });
    });

    it('只调用一次 setAudioModeAsync', async () => {
      setAudioModeAsync.mockResolvedValue(undefined);
      await prepareRecordingEnvironment();
      expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    });

    it('setAudioModeAsync 失败时抛出异常', async () => {
      setAudioModeAsync.mockRejectedValue(new Error('Audio mode error'));
      await expect(prepareRecordingEnvironment()).rejects.toThrow('Audio mode error');
    });
  });

  // ============================
  // restorePlaybackEnvironment
  // ============================
  describe('restorePlaybackEnvironment', () => {
    it('设置 allowsRecording=false, interruptionMode=duckOthers', async () => {
      setAudioModeAsync.mockResolvedValue(undefined);
      await restorePlaybackEnvironment();

      expect(setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
      });
    });

    it('与 prepareRecordingEnvironment 使用不同参数', async () => {
      setAudioModeAsync.mockResolvedValue(undefined);
      await prepareRecordingEnvironment();
      await restorePlaybackEnvironment();

      const firstCall = setAudioModeAsync.mock.calls[0][0];
      const secondCall = setAudioModeAsync.mock.calls[1][0];

      expect(firstCall.allowsRecording).toBe(true);
      expect(firstCall.interruptionMode).toBe('doNotMix');
      expect(secondCall.allowsRecording).toBe(false);
      expect(secondCall.interruptionMode).toBe('duckOthers');
    });
  });

  // ============================
  // RECORDING_OPTIONS
  // ============================
  describe('RECORDING_OPTIONS', () => {
    it('使用 HIGH_QUALITY 预设', () => {
      expect(RECORDING_OPTIONS).toBe(RecordingPresets.HIGH_QUALITY);
    });

    it('配置了正确的音频参数', () => {
      expect(RECORDING_OPTIONS.extension).toBe('.m4a');
      expect(RECORDING_OPTIONS.sampleRate).toBe(44100);
      expect(RECORDING_OPTIONS.numberOfChannels).toBe(2);
      expect(RECORDING_OPTIONS.bitRate).toBe(128000);
    });

    it('iOS 使用 AAC 编码器', () => {
      expect(RECORDING_OPTIONS.ios.extension).toBe('.m4a');
      expect(RECORDING_OPTIONS.ios.audioQuality).toBeDefined();
    });

    it('Android 使用 AAC 编码器', () => {
      expect(RECORDING_OPTIONS.android.extension).toBe('.m4a');
      expect(RECORDING_OPTIONS.android.audioEncoder).toBe('aac');
    });
  });
});
