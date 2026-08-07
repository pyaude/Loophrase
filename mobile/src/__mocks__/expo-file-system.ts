// Mock: expo-file-system (SDK 57 File/Directory/Paths API)

const mockFileData = new Map<string, { content: string; size: number }>();

class MockFile {
  uri: string;

  constructor(...parts: string[]) {
    this.uri = parts.join('/');
  }

  get exists() {
    return mockFileData.has(this.uri);
  }

  get extension() {
    const parts = this.uri.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  get size() {
    return mockFileData.get(this.uri)?.size ?? 0;
  }

  async text() {
    return mockFileData.get(this.uri)?.content ?? '';
  }

  async copy(dest: MockFile) {
    const src = mockFileData.get(this.uri);
    if (src) {
      mockFileData.set(dest.uri, { ...src });
    }
  }

  delete() {
    mockFileData.delete(this.uri);
  }
}

class MockDirectory {
  uri: string;

  constructor(...parts: string[]) {
    this.uri = parts.join('/');
  }

  get exists() {
    return true; // 简化
  }

  create() {
    // no-op
  }
}

export const Paths = {
  document: 'file:///mock-document',
  cache: 'file:///mock-cache',
};

export { MockFile as File, MockDirectory as Directory };

// 测试工具：重置文件系统 mock
export function __resetMockFileSystem() {
  mockFileData.clear();
}

export function __setMockFile(uri: string, content: string) {
  mockFileData.set(uri, { content, size: content.length });
}
