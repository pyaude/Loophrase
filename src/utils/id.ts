// 生成 UUID v4（React Native 无 crypto API，使用纯 JS 实现）
export function generateId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[(Math.random() * 4) | 0x8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}
