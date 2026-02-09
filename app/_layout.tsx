/**
 * 根布局 - Expo Router
 */
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '../src/store';
import { useIsDark } from '../src/hooks/useTheme';

export default function RootLayout() {
  const init = useAppStore((s) => s.init);
  const initialized = useAppStore((s) => s.initialized);
  const isDark = useIsDark();

  useEffect(() => {
    init();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
    </>
  );
}
