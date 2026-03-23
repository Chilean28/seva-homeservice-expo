import { WorkLocationSelectionProvider } from '@/lib/contexts/WorkLocationSelectionContext';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const YELLOW = '#FFEB3B';

export default function ProfileLayout() {
  return (
    <WorkLocationSelectionProvider>
      <StatusBar style="dark" backgroundColor={YELLOW} translucent />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: YELLOW },
          animation: 'default',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="set-work-location" />
        <Stack.Screen name="personal-info" />
        <Stack.Screen name="account" />
        <Stack.Screen name="set-rates" />
        <Stack.Screen name="stripe-connect" />
      </Stack>
    </WorkLocationSelectionProvider>
  );
}
