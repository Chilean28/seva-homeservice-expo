import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
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
        <Text style={styles.body}>
          Granular in-app notification preferences (e.g. turn off marketing vs. booking alerts) will come in a
          later update.
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
});
