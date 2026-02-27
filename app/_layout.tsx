/**
 * 根布局 - Expo Router（V2.0）
 * 统一状态栏、错误边界与页面容器入口。
 */
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { useAppStore } from '../src/store';
import { useIsDark, useTheme } from '../src/hooks/useTheme';

export default function RootLayout() {
  const init = useAppStore((s) => s.init);
  const initialized = useAppStore((s) => s.initialized);
  const isDark = useIsDark();
  const colors = useTheme();

  useEffect(() => {
    console.log('[RootLayout] 开始初始化应用');
    init().catch((err) => {
      console.error('[RootLayout] 初始化错误:', err);
    });
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="rag"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
    </ErrorBoundary>
  );
}
