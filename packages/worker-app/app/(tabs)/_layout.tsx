import { usePendingJobs } from '@/lib/contexts/PendingJobsContext';
import { useUnreadChat } from '@/lib/contexts/UnreadChatContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ErrorBoundary } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, router, useSegments } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const redDot = {
  position: 'absolute' as const,
  top: -2,
  right: -6,
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: '#FF3B30',
};

export default function TabLayout() {
  const { unreadCount } = useUnreadChat();
  const { pendingJobsCount } = usePendingJobs();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const segments = useSegments();
  const segs = segments as string[];
  const isOnSetRates = segs.includes('profile') && segs.includes('set-rates');

  return (
    <ErrorBoundary>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#666',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFEB3B',
          borderTopColor: '#FFEB3B',
          height: Platform.OS === 'ios' ? 64 + bottomInset : Platform.OS === 'web' ? 64 : 70 + bottomInset,
          paddingBottom: Platform.OS === 'web' ? 8 : 10 + bottomInset,
          paddingTop: 10,
          ...Platform.select({
            ios: { position: 'absolute' },
            web: { position: 'relative' as const },
            default: {},
          }),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }: { color: string }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol size={28} name="list.bullet" color={color} />
              {pendingJobsCount > 0 ? <View style={redDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={26} color={color} />
              {unreadCount > 0 ? <View style={redDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title: 'Availability',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
        listeners={{
          tabPress: (e: any) => {
            // If user taps Profile while already inside /profile/set-rates,
            // reset to the Profile index screen instead of staying on Set rates.
            if (isOnSetRates) {
              e.preventDefault();
              router.replace('/(tabs)/profile');
            }
          },
        }}
      />
    </Tabs>
    </ErrorBoundary>
  );
}
