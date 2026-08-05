// 生成 UUID（使用 crypto API）
export function generateId(): string {
  return crypto.randomUUID();
}
