import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="personal-info" />
      <Stack.Screen name="account" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="address-form" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="help" />
    </Stack>
  );
}
