// 音频会话管理：处理中断、耳机断连、后台切换（§10 稳定性）

import { setAudioModeAsync } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

type InterruptCallback = () => void;
type ResumeCallback = () => void;

let isInitialized = false;
let interruptCallback: InterruptCallback | null = null;
let resumeCallback: ResumeCallback | null = null;
let appStateSubscription: { remove: () => void } | null = null;

/**
 * 初始化音频会话，设置合适的音频模式。
 * 应在 App 启动时调用。
 */
export async function initAudioSession(): Promise<void> {
  if (isInitialized) return;

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });

  // 监听 App 状态变化（后台切换）
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      interruptCallback?.();
    } else if (state === 'active') {
      resumeCallback?.();
    }
  });

  isInitialized = true;
}

/**
 * 切换到录音模式（暂停其他音频）。
 */
export async function enterRecordingMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
  });
}

/**
 * 切换到播放模式（恢复播放）。
 */
export async function enterPlaybackMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: false,
  });
}

/**
 * 注册中断/恢复回调。
 * 在来电、耳机断连、后台切换时触发。
 */
export function setInterruptListeners(
  onInterrupt: InterruptCallback,
  onResume?: ResumeCallback,
): void {
  interruptCallback = onInterrupt;
  resumeCallback = onResume ?? null;
}

/** 清理监听 */
export function cleanupAudioSession(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
  interruptCallback = null;
  resumeCallback = null;
  isInitialized = false;
}
