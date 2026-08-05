// 媒体文件管理：将导入的媒体复制到 App 私有目录（FR-M01/M05）
// 使用 Expo SDK 57 的全新 File / Directory / Paths API

import { File, Directory, Paths } from 'expo-file-system';
import { generateId } from '../utils/id';

/** 确保目录存在 */
function ensureDir(dir: Directory): Directory {
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

function getMediaDir(): Directory {
  return ensureDir(new Directory(Paths.document, 'media'));
}

function getRecordingDir(): Directory {
  return ensureDir(new Directory(Paths.document, 'recordings'));
}

/**
 * 将外部文件复制到 App 私有目录。
 * 返回新的本地 URI。
 */
export async function importMediaFile(sourceUri: string): Promise<string> {
  const mediaDir = getMediaDir();

  const sourceFile = new File(sourceUri);
  const ext = sourceFile.extension || 'mp4';
  const filename = `${generateId()}.${ext}`;
  const destFile = new File(mediaDir, filename);

  await sourceFile.copy(destFile);

  return destFile.uri;
}

/** 删除本地媒体文件 */
export function deleteMediaFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}

/** 保存录音文件到私有目录 */
export async function saveRecording(sourceUri: string): Promise<string> {
  const recordingDir = getRecordingDir();

  const sourceFile = new File(sourceUri);
  const filename = `${generateId()}.m4a`;
  const destFile = new File(recordingDir, filename);

  await sourceFile.copy(destFile);

  return destFile.uri;
}

/** 获取文件大小（字节） */
export function getFileSize(uri: string): number {
  const file = new File(uri);
  return file.exists ? file.size : 0;
}
