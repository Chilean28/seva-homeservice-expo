import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.rootYellow}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Account & Security</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.placeholder}>Password and security options can be managed here.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootYellow: { flex: 1, backgroundColor: APP_SCREEN_HEADER_BG },
  headerWrap: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { padding: 20 },
  placeholder: { fontSize: 15, color: '#666' },
});
