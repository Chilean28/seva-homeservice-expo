import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

const menuItems: { id: string; label: string; icon: 'person-outline' | 'location-outline' | 'lock-closed-outline' | 'card-outline' | 'notifications-outline' | 'headset-outline'; route: string; params?: Record<string, string> }[] = [
  { id: 'personal', label: 'Personal Info', icon: 'person-outline', route: '/(tabs)/profile/personal-info' },
  { id: 'addresses', label: 'Addresses', icon: 'location-outline', route: '/(tabs)/profile/addresses' },
  { id: 'account', label: 'Account & Security', icon: 'lock-closed-outline', route: '/(tabs)/profile/account' },
  { id: 'payment', label: 'Payment', icon: 'card-outline', route: '/payment-methods', params: { from: 'profile' } },
  { id: 'notifications', label: 'Notifications', icon: 'notifications-outline', route: '/(tabs)/profile/notifications' },
  { id: 'help', label: 'Help & Support', icon: 'headset-outline', route: '/(tabs)/profile/help' },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'Guest';
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  const handleSignOut = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  const handleMenuItem = (item: (typeof menuItems)[number]) => {
    if (item.params) {
      router.push({ pathname: item.route as any, params: item.params });
    } else {
      router.push(item.route as any);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Profile</Text>
            </View>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {displayName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{displayName}</Text>
        </View>

        <View style={styles.menu}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => handleMenuItem(item)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={22} color="#000" style={styles.menuIcon} />
              <Text style={styles.menuText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemLast]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={22} color="#FF3B30" style={styles.menuIcon} />
            <Text style={styles.logoutText}>Logout</Text>
            <Ionicons name="chevron-forward" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  headerSide: { width: 24 },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  content: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatarWrapper: {
    marginBottom: 6,
    position: 'relative',
  },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 32, fontWeight: '600', color: '#666' },
  userName: { fontSize: 18, fontWeight: '600', color: '#000', textAlign: 'center' },
  menu: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuIcon: { marginRight: 14 },
  menuText: { flex: 1, fontSize: 16, color: '#000' },
  menuItemLast: { borderBottomWidth: 0 },
  logoutText: { flex: 1, fontSize: 16, color: '#FF3B30', fontWeight: '500' },
});
