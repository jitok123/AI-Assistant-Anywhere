/**
 * 主题常量
 */
export const Colors = {
  light: {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    primary: '#4A7DFF',
    primaryLight: '#E8EEFF',
    text: '#1A1A2E',
    textSecondary: '#666666',
    textTertiary: '#999999',
    border: '#E0E0E0',
    error: '#FF4757',
    success: '#2ED573',
    userBubble: '#4A7DFF',
    userBubbleText: '#FFFFFF',
    aiBubble: '#FFFFFF',
    aiBubbleText: '#1A1A2E',
    inputBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    sidebarBg: '#F0F0F0',
    danger: '#FF4757',
  },
  dark: {
    background: '#0F0F23',
    surface: '#1A1A2E',
    primary: '#4A7DFF',
    primaryLight: '#1E2A4A',
    text: '#E8E8E8',
    textSecondary: '#AAAAAA',
    textTertiary: '#666666',
    border: '#2A2A3E',
    error: '#FF6B7A',
    success: '#5AE89B',
    userBubble: '#4A7DFF',
    userBubbleText: '#FFFFFF',
    aiBubble: '#1E1E32',
    aiBubbleText: '#E8E8E8',
    inputBg: '#1A1A2E',
    headerBg: '#1A1A2E',
    sidebarBg: '#0A0A1A',
    danger: '#FF6B7A',
  },
};

export type ThemeColors = typeof Colors.light;
