// 应用更新服务：检查新版本、下载 APK、触发安装（§U2）

import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

// Intent action 常量（expo-intent-launcher 的 ActivityAction 枚举中没有 VIEW）
const ACTION_VIEW = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

// 版本服务器地址，通过环境变量配置
const UPDATE_SERVER_URL = process.env.EXPO_PUBLIC_UPDATE_SERVER_URL ?? '';

// 同一版本的更新提示 24h 内不重复弹出
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// 上次检查的时间戳存储 key
const LAST_CHECK_KEY = 'update_last_check_version';

/** 更新检查结果 */
export interface UpdateCheckResult {
  has_update: boolean;
  latest_version: string;
  min_required_version?: string;
  is_force_update?: boolean;
  changelog?: string;
  download_url?: string;
  file_size?: number;
  published_at?: string;
}

/** 下载进度回调 */
export type DownloadProgressCallback = (progress: number, totalBytes: number, downloadedBytes: number) => void;

/** 下载状态 */
export type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'error';

/**
 * 获取当前 App 版本号
 */
export function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? '0.0.0';
}

/**
 * 检查是否有新版本可用
 * @param force 是否强制检查（忽略 24h 缓存）
 */
export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  if (!UPDATE_SERVER_URL) {
    throw new Error('未配置更新服务器地址');
  }

  const currentVersion = getAppVersion();
  const platform = Platform.OS;

  // 非强制检查时，检查是否在 24h 缓存期内
  if (!force) {
    const lastCheck = await getLastCheckInfo();
    if (lastCheck && lastCheck.version === currentVersion) {
      const elapsed = Date.now() - lastCheck.timestamp;
      if (elapsed < CHECK_INTERVAL_MS) {
        return { has_update: false, latest_version: currentVersion };
      }
    }
  }

  const url = `${UPDATE_SERVER_URL}/api/v1/check-update?platform=${platform}&version=${currentVersion}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`服务器返回错误 (${response.status})`);
  }

  const result: UpdateCheckResult = await response.json();

  // 记录本次检查时间
  await recordCheck(currentVersion);

  return result;
}

/**
 * 下载 APK 文件
 * @param downloadUrl APK 下载地址
 * @param onProgress 下载进度回调（0-1）
 */
export async function downloadApk(
  downloadUrl: string,
  onProgress?: DownloadProgressCallback,
): Promise<string> {
  const apkFileName = `Loophrase-update.apk`;
  const downloadPath = `${FileSystem.cacheDirectory}${apkFileName}`;

  // 如果已存在旧文件，先删除
  const fileInfo = await FileSystem.getInfoAsync(downloadPath);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(downloadPath);
  }

  // 使用 createDownloadResumable 支持进度回调
  const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
    if (downloadProgress.totalBytesExpectedToWrite > 0) {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(
        progress,
        downloadProgress.totalBytesExpectedToWrite,
        downloadProgress.totalBytesWritten,
      );
    }
  };

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    downloadPath,
    {},
    callback,
  );

  const result = await downloadResumable.downloadAsync();

  if (!result || result.status !== 200) {
    throw new Error(`下载失败: HTTP ${result?.status ?? 'unknown'}`);
  }

  return result.uri;
}

/**
 * 触发系统安装器安装 APK
 */
export async function installApk(apkUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('仅支持 Android 平台');
  }

  // 将 file:// 转为 content:// URI（Android 7+ 要求 FileProvider）
  const contentUri = await FileSystem.getContentUriAsync(apkUri);

  await IntentLauncher.startActivityAsync(ACTION_VIEW, {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/**
 * 下载并安装 APK（组合操作）
 */
export async function downloadAndInstall(
  downloadUrl: string,
  onProgress?: DownloadProgressCallback,
): Promise<void> {
  const apkUri = await downloadApk(downloadUrl, onProgress);
  await installApk(apkUri);
}

// === 本地存储辅助 ===

interface CheckInfo {
  version: string;
  timestamp: number;
}

const STORAGE_KEY = 'loophrase_update_check';

async function getLastCheckInfo(): Promise<CheckInfo | null> {
  try {
    const value = await FileSystem.readAsStringAsync(
      `${FileSystem.cacheDirectory}${STORAGE_KEY}`,
      { encoding: FileSystem.EncodingType.UTF8 },
    ).catch(() => null);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function recordCheck(version: string): Promise<void> {
  try {
    const info: CheckInfo = { version, timestamp: Date.now() };
    await FileSystem.writeAsStringAsync(
      `${FileSystem.cacheDirectory}${STORAGE_KEY}`,
      JSON.stringify(info),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  } catch {
    // 忽略写入失败
  }
}

/** 重置检查记录（调试用） */
export async function resetCheckRecord(): Promise<void> {
  try {
    await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${STORAGE_KEY}`);
  } catch {
    // 忽略
  }
}
