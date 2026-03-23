import {
  APP_SCREEN_HEADER_BG,
  APP_SCREEN_HEADER_PADDING_BOTTOM,
  APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  APP_SCREEN_HEADER_PADDING_TOP_INNER,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top, backgroundColor: APP_SCREEN_HEADER_BG }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.backBtn} />
        </View>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No notifications yet</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  headerWrap: {
    backgroundColor: APP_SCREEN_HEADER_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: APP_SCREEN_HEADER_PADDING_HORIZONTAL,
    paddingBottom: APP_SCREEN_HEADER_PADDING_BOTTOM,
    paddingTop: APP_SCREEN_HEADER_PADDING_TOP_INNER,
    backgroundColor: APP_SCREEN_HEADER_BG,
  },
  backBtn: { padding: 8, minWidth: 40 },
  title: { ...appScreenHeaderTitleStyle },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
