// 跟读录音服务（FR-P04）
// 管理录音权限、录音生命周期、录音文件存储

import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingStatus,
} from 'expo-audio';
import { saveRecording } from './mediaManager';

const RECORDING_OPTIONS = RecordingPresets.HIGH_QUALITY;

/**
 * 请求录音权限。
 * 返回是否已获授权。
 */
export async function ensureRecordingPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

/**
 * 准备录音环境。
 * 在开始录音前调用。
 */
export async function prepareRecordingEnvironment(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
  });
}

/**
 * 录音完成后恢复播放环境。
 */
export async function restorePlaybackEnvironment(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
  });
}

export {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  RECORDING_OPTIONS,
  saveRecording,
  type AudioRecorder,
  type RecordingStatus,
};
