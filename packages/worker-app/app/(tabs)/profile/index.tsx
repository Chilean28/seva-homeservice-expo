import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useStripeConnectBalances } from '@/lib/hooks/useStripeConnectBalances';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  useRefreshOnAppActive,
} from '@seva/shared';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodayScheduleDate, hasAvailabilityWindows } from '@/lib/workerAvailability';

const menuItems = [
  { id: 'personal', label: 'Personal Info', icon: 'person-outline' as const, route: '/(tabs)/profile/personal-info' },
  { id: 'account', label: 'Account & Security', icon: 'lock-closed-outline' as const, route: '/(tabs)/profile/account' },
  { id: 'payouts', label: 'Payouts', icon: 'wallet-outline' as const, route: '/payouts' },
  { id: 'stripe', label: 'Connect Stripe', icon: 'card-outline' as const, route: '/(tabs)/profile/stripe-connect' },
  { id: 'refund-policy', label: 'Refund Policy', icon: 'document-text-outline' as const, route: '/legal/refund-policy' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { profile, loading, setAvailability, refetch: refetchProfile } = useWorkerProfile(user?.id);
  const { balances, refetch: refetchStripe } = useStripeConnectBalances();
  const todayStr = useMemo(() => getTodayScheduleDate(), []);
  const [availabilityGateLoading, setAvailabilityGateLoading] = useState(true);
  const [hasAvailabilitySlots, setHasAvailabilitySlots] = useState(false);
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'Worker';
  const avatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  const loadAvailabilityGate = useCallback(async () => {
    if (!profile?.id) {
      setHasAvailabilitySlots(false);
      setAvailabilityGateLoading(false);
      return;
    }
    setAvailabilityGateLoading(true);
    const ok = await hasAvailabilityWindows(profile.id, todayStr);
    setHasAvailabilitySlots(ok);
    setAvailabilityGateLoading(false);
  }, [profile?.id, todayStr]);

  useFocusEffect(
    useCallback(() => {
      refetchProfile();
      refetchStripe();
      loadAvailabilityGate();
    }, [refetchProfile, refetchStripe, loadAvailabilityGate])
  );

  useRefreshOnAppActive(() => {
    refetchProfile();
    refetchStripe();
    void loadAvailabilityGate();
  });

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
            } catch (e) {
              console.error('Sign out error:', e);
            }
          },
        },
      ]
    );
  };

  const handleMenuItem = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>
        </SafeAreaView>
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: Math.max(insets.bottom, 16) + 120 },
        ]}
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
          {profile?.bio ? (
            <Text style={styles.bioUnderName} numberOfLines={3}>{profile.bio}</Text>
          ) : user?.email ? (
            <Text style={styles.email}>{user.email}</Text>
          ) : null}
          {profile && (
            <View style={styles.statsRow}>
              <Text style={styles.stat}>{profile.total_jobs_completed} jobs</Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.stat}>{Number(profile.rating_average).toFixed(1)} rating</Text>
            </View>
          )}
        </View>

        {profile && (
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityLeft}>
              <Text style={styles.availabilityLabel}>Available for jobs</Text>
              {availabilityGateLoading ? (
                <Text style={styles.availabilityHint}>Checking availability...</Text>
              ) : hasAvailabilitySlots ? null : (
                <Text style={styles.availabilityHint}>Add at least one availability slot to enable.</Text>
              )}
            </View>
            <Switch
              value={profile.is_available}
              onValueChange={setAvailability}
              disabled={availabilityGateLoading || !hasAvailabilitySlots}
              trackColor={{
                false: availabilityGateLoading || !hasAvailabilitySlots ? '#FFFDE7' : '#e5e5e5',
                true: '#FFEB3B',
              }}
              // RN `Switch` can ignore disabled thumb color in some cases,
              // so force the OFF thumb to a non-black gray.
              thumbColor="#fff"
            />
          </View>
        )}

        <TouchableOpacity
          style={styles.balanceStrip}
          onPress={() => router.push('/payouts')}
          activeOpacity={0.8}
        >
          <Ionicons name="wallet-outline" size={22} color="#000" />
          <View style={styles.balanceStripText}>
            {balances?.noAccount ? (
              <Text style={styles.balanceLine}>Connect account to see balance</Text>
            ) : balances?.error ? (
              <Text style={styles.balanceLineMuted}>{balances.error}</Text>
            ) : (
              <>
                <Text style={styles.balanceLine}>
                  Available ${((balances?.available_cents ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.balanceLineMuted}>
                  Pending ${((balances?.pending_cents ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.balanceDisclaimer}>
                  Connect balance; fee &amp; payouts in Stripe
                </Text>
              </>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>

        <View style={styles.menu}>
          {profile ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                router.push({ pathname: '/(tabs)/profile/setup', params: { from: 'profile' } } as Parameters<typeof router.push>[0])
              }
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={22} color="#000" style={styles.menuIcon} />
              <Text style={styles.menuText}>Edit profile</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ) : null}
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => handleMenuItem(item.route)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={22} color="#000" style={styles.menuIcon} />
              <Text style={styles.menuText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
          {!profile && !loading && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push({ pathname: '/(tabs)/profile/setup', params: { from: 'profile' } })}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={22} color="#F9A825" style={styles.menuIcon} />
              <Text style={styles.menuTextHighlight}>Complete your profile</Text>
              <Ionicons name="chevron-forward" size={20} color="#F9A825" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={22} color="#FF3B30" style={styles.menuIcon} />
            <Text style={styles.logoutText}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_SCREEN_HEADER_BG },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    ...appScreenHeaderBarPadding,
  },
  headerTitle: { ...appScreenHeaderTitleStyle },
  content: { flex: 1, backgroundColor: '#ffffff' },
  contentContainer: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
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
  email: { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center' },
  bioUnderName: { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  stat: { fontSize: 14, color: '#666' },
  statDot: { fontSize: 14, color: '#999', marginHorizontal: 6 },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  availabilityLeft: { flex: 1, paddingRight: 12 },
  availabilityLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
  availabilityHint: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 2 },
  balanceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDE7',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFEB3B',
  },
  balanceStripText: { flex: 1 },
  balanceLine: { fontSize: 15, fontWeight: '700', color: '#000' },
  balanceLineMuted: { fontSize: 13, color: '#666', marginTop: 2 },
  balanceDisclaimer: { fontSize: 11, color: '#888', marginTop: 4 },
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
  menuTextSubtle: { flex: 1, fontSize: 16, color: '#666' },
  menuTextHighlight: { flex: 1, fontSize: 16, color: '#F9A825', fontWeight: '600' },
  menuItemLast: { borderBottomWidth: 0 },
  logoutText: { flex: 1, fontSize: 16, color: '#FF3B30', fontWeight: '500' },
});
