import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Change to your real support inbox for production. */
const SUPPORT_EMAIL = 'support@example.com';

const FAQ_ITEMS = [
  {
    q: 'How do bookings work?',
    a: 'You choose a service and time; workers in your area can accept. You’ll see status updates (pending → accepted → in progress → completed) on your booking.',
  },
  {
    q: 'When am I charged?',
    a: 'For card payments, you authorize payment in line with the booking flow. Final amounts follow the estimate (rate × time and any promo). Cash jobs are arranged outside the card flow.',
  },
  {
    q: 'What if I cancel?',
    a: 'You can cancel from the booking when allowed. For card bookings, releasing or adjusting a hold may apply depending on timing and payment state—see your booking screen for the latest.',
  },
];

export default function HelpScreen() {
  const openSupport = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=Seva%20customer%20support`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Common questions</Text>
        {FAQ_ITEMS.map((item) => (
          <View key={item.q} style={styles.faqBlock}>
            <Text style={styles.faqQ}>{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
        <Text style={styles.sectionTitle}>Contact us</Text>
        <Text style={styles.body}>
          Need something else? Email us and we’ll get back to you as soon as we can.
        </Text>
        <TouchableOpacity style={styles.supportBtn} onPress={openSupport} accessibilityRole="button">
          <Ionicons name="mail-outline" size={22} color="#000" />
          <Text style={styles.supportBtnText}>{SUPPORT_EMAIL}</Text>
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  faqBlock: { marginBottom: 20 },
  faqQ: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6 },
  faqA: { fontSize: 14, color: '#555', lineHeight: 20 },
  body: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 16 },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFEB3B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  supportBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },
});
