import { Stack } from 'expo-router';

/**
 * Nested stack: /worker/:id (booking flow) and /worker/:id/info (read-only profile from chat).
 */
export default function WorkerIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="info" />
    </Stack>
  );
}
