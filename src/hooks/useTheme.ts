/**
 * 主题 Hook
 */
import { useColorScheme } from 'react-native';
import { Colors, ThemeColors } from '../constants/theme';
import { useAppStore } from '../store';

export function useTheme(): ThemeColors {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);

  let scheme: 'light' | 'dark' = 'dark';
  if (themeSetting === 'auto') {
    scheme = systemScheme === 'dark' ? 'dark' : 'light';
  } else {
    scheme = themeSetting as 'light' | 'dark';
  }

  return Colors[scheme];
}

export function useIsDark(): boolean {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);

  if (themeSetting === 'auto') {
    return systemScheme === 'dark';
  }
  return themeSetting === 'dark';
}
