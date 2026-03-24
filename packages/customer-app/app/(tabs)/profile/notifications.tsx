import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type BookingNotificationItem = {
  id: string;
  status: string;
  updated_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ongoing: 'In-progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatTime(iso: string | null): string {
  if (!iso) return 'Recently';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<BookingNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('bookings')
      .select('id, status, updated_at')
      .eq('customer_id', user.id)
      .in('status', ['accepted', 'ongoing', 'completed', 'cancelled'])
      .order('updated_at', { ascending: false })
      .limit(20);
    setItems((data as BookingNotificationItem[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-bookings:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const openSystemSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="notifications-outline" size={48} color="#CCC" style={styles.icon} />
        <Text style={styles.title}>Push notifications</Text>
        <Text style={styles.body}>
          We use push notifications for booking updates—when a worker accepts, when your job status changes, and
          other reminders tied to your bookings.
        </Text>
        <Text style={styles.subheading}>Device settings</Text>
        <Text style={styles.body}>
          On {Platform.OS === 'ios' ? 'iOS' : 'Android'}, you can allow or block Seva in your system notification
          settings. Use the button below to open {Platform.OS === 'ios' ? 'Settings' : 'app notification settings'}{' '}
          if your device supports it.
        </Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={openSystemSettings}
          accessibilityRole="button"
          accessibilityLabel="Open notification settings"
        >
          <Ionicons name="settings-outline" size={22} color="#000" />
          <Text style={styles.settingsBtnText}>Open system settings</Text>
        </TouchableOpacity>

        <Text style={styles.subheading}>Recent booking updates</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#000" style={styles.listLoader} />
        ) : items.length === 0 ? (
          <Text style={styles.body}>No booking status notifications yet.</Text>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.listItemIcon}>
                  <Ionicons name="time-outline" size={16} color="#000" />
                </View>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle}>
                    Booking is now {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                  <Text style={styles.listItemTime}>{formatTime(item.updated_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { width: 40 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  icon: { alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 12 },
  subheading: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  body: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 12 },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFEB3B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  settingsBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },
  listLoader: { marginTop: 8, marginBottom: 8 },
  list: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  listItemIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  listItemContent: { flex: 1 },
  listItemTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  listItemTime: { fontSize: 12, color: '#777', marginTop: 2 },
});
