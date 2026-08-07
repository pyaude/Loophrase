// Loophrase 主题：颜色、字号、间距

export const colors = {
  primary: '#4F46E5',
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  accent: '#F59E0B',

  // 背景
  bg: '#FFFFFF',
  bgSecondary: '#F3F4F6',
  bgDark: '#111827',

  // 文本
  text: '#1F2937',
  textSecondary: '#6B7280',
  textInverse: '#FFFFFF',

  // 状态
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // 边框
  border: '#E5E7EB',

  // 学习状态
  stateNew: '#9CA3AF',
  statePracticing: '#F59E0B',
  stateDue: '#3B82F6',
  stateMastered: '#10B981',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;
