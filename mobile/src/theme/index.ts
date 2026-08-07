// Loophrase 主题：简约现代设计系统

export const colors = {
  // 品牌
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  primaryBg: '#EEF2FF',
  accent: '#F59E0B',

  // 背景
  bg: '#FAFAFA',
  bgSecondary: '#F4F4F5',
  bgWhite: '#FFFFFF',
  bgDark: '#0A0A0A',

  // 文本
  text: '#18181B',
  textSecondary: '#71717A',
  textTertiary: '#A1A1AA',
  textInverse: '#FFFFFF',

  // 状态
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // 边框
  border: '#E4E4E7',
  borderLight: '#F4F4F5',

  // 学习状态
  stateNew: '#A1A1AA',
  statePracticing: '#F59E0B',
  stateDue: '#3B82F6',
  stateMastered: '#22C55E',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
} as const;
