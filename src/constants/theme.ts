/**
 * 主题常量
 */
export const Colors = {
  light: {
    background: '#EEF2FA',
    surface: '#FFFFFF',
    primary: '#2B6CFF',
    primaryLight: '#DDE8FF',
    text: '#0B1221',
    textSecondary: '#2F3D55',
    textTertiary: '#6D7D96',
    border: '#C8D6EE',
    error: '#EF4444',
    success: '#10B981',
    userBubble: '#7B7FF6',
    userBubbleText: '#FFFFFF',
    aiBubble: '#F8FBFF',
    aiBubbleText: '#111827',
    inputBg: '#F9FBFF',
    headerBg: '#F5F8FF',
    sidebarBg: '#EAF0FB',
    danger: '#EF4444',
  },
  dark: {
    background: '#050A14',
    surface: '#0D1728',
    primary: '#5A9BFF',
    primaryLight: '#182A48',
    text: '#EAF2FF',
    textSecondary: '#A8B8CF',
    textTertiary: '#7486A3',
    border: '#213451',
    error: '#F87171',
    success: '#34D399',
    userBubble: '#6F77E8',
    userBubbleText: '#FFFFFF',
    aiBubble: '#101C31',
    aiBubbleText: '#EAF2FF',
    inputBg: '#0F1B2E',
    headerBg: '#0B1424',
    sidebarBg: '#091222',
    danger: '#F87171',
  },
};

export type ThemeColors = typeof Colors.light;

export const UserBubbleStyleColors = {
  lavender: {
    light: '#7B7FF6',
    dark: '#6F77E8',
  },
  mint: {
    light: '#36BFA1',
    dark: '#2E9E88',
  },
  rose: {
    light: '#E76F93',
    dark: '#C95A7F',
  },
  slate: {
    light: '#5E7FA6',
    dark: '#567197',
  },
};

export const Typography = {
  fontFamily: 'System',
};

export function getUserBubbleColorByStyle(
  style: 'lavender' | 'mint' | 'rose' | 'slate' | undefined,
  isDark: boolean,
): string {
  const key = style && UserBubbleStyleColors[style] ? style : 'lavender';
  return isDark ? UserBubbleStyleColors[key].dark : UserBubbleStyleColors[key].light;
}
