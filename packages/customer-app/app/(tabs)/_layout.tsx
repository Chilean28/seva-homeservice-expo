import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBookingAlerts } from '@/lib/contexts/BookingAlertsContext';
import { useUnreadChat } from '@/lib/contexts/UnreadChatContext';
import { ErrorBoundary } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
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
  const insets = useSafeAreaInsets();
  const { unreadCount } = useUnreadChat();
  const { pendingBookingCount } = useBookingAlerts();
  const androidBottom = Platform.OS === 'android' ? insets.bottom : 0;
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
          height: Platform.OS === 'ios' ? 90 : 70 + androidBottom,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10 + androidBottom,
          ...Platform.select({
            ios: {
              position: 'absolute',
            },
            default: {},
          }),
          paddingTop: 10,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Booking',
          tabBarIcon: ({ color }: { color: string }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol size={28} name="clipboard" color={color} />
              {pendingBookingCount > 0 ? <View style={redDot} /> : null}
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
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={26}
                color={color}
              />
              {unreadCount > 0 ? <View style={redDot} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="services" options={{ href: null }} />
    </Tabs>
    </ErrorBoundary>
  );
}
