// Jest setup：全局 polyfill 与 mock

// crypto.randomUUID polyfill for test environment
if (!globalThis.crypto) {
  globalThis.crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 11),
  } as any;
}
