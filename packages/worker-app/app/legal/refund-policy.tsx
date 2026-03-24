import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WorkerRefundPolicyScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Refund policy</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Worker confirmation flow</Text>
        <Text style={styles.body}>- Customers can request refunds for completed card bookings within 48 hours.</Text>
        <Text style={styles.body}>- You review the request and confirm if a full refund should be issued.</Text>
        <Text style={styles.body}>- After confirmation, Seva submits the Stripe refund for the booking.</Text>
        <Text style={styles.sectionTitle}>Operational notes</Text>
        <Text style={styles.body}>- This release supports full refunds only.</Text>
        <Text style={styles.body}>- Refund processing and settlement timing are handled by Stripe and banks.</Text>
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
    ...appScreenHeaderBarPadding,
    backgroundColor: APP_SCREEN_HEADER_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  backBtn: { width: 40 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 10, marginTop: 6 },
  body: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
});
