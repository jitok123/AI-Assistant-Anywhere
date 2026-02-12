/**
 * 主题常量
 */
export const Colors = {
  light: {
    background: '#F3F6FB',
    surface: '#FFFFFF',
    primary: '#3F6EF6',
    primaryLight: '#E6EDFF',
    text: '#111827',
    textSecondary: '#4B5563',
    textTertiary: '#94A3B8',
    border: '#D8E1F1',
    error: '#EF4444',
    success: '#10B981',
    userBubble: '#3F6EF6',
    userBubbleText: '#FFFFFF',
    aiBubble: '#FFFFFF',
    aiBubbleText: '#111827',
    inputBg: '#FFFFFF',
    headerBg: '#F8FAFF',
    sidebarBg: '#EEF2FA',
    danger: '#EF4444',
  },
  dark: {
    background: '#0C111B',
    surface: '#121A28',
    primary: '#5B8CFF',
    primaryLight: '#1B2740',
    text: '#E5E7EB',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    border: '#283347',
    error: '#F87171',
    success: '#34D399',
    userBubble: '#4B74F5',
    userBubbleText: '#FFFFFF',
    aiBubble: '#172134',
    aiBubbleText: '#E5E7EB',
    inputBg: '#121A28',
    headerBg: '#101827',
    sidebarBg: '#0D1522',
    danger: '#F87171',
  },
};

export type ThemeColors = typeof Colors.light;
