import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ServiceRow = { id: string; name: string; base_price: number };

// Dark, vibrant colors for the icon circle accents
const SERVICE_COLORS = ['#1E40AF', '#115E59', '#166534', '#5B21B6', '#B45309', '#9F1239', '#4338CA', '#C2410C', '#A21CAF', '#9A3412'];

const SERVICE_ICONS: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  cleaning: 'broom',
  'mounting/assembly': 'hammer-wrench',
  handyman: 'wrench',
  plumbing: 'water-pump',
  electrical: 'flash',
  moving: 'truck-fast-outline',
  'pest control': 'shield-bug-outline',
  landscaping: 'leaf',
  painting: 'brush',
  'appliance repair/installation': 'toolbox-outline',
  'aircon service (ac cleaning)': 'air-conditioner',
  'smart home / cctv installation': 'cctv',
  default: 'tools',
};

function iconFor(name: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const key = name.toLowerCase();
  return SERVICE_ICONS[key] ?? SERVICE_ICONS.default;
}

export default function ServicesScreen() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data } = await supabase
        .from('services')
        .select('id, name, base_price')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      setServices((data as ServiceRow[]) ?? []);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setServices([]);
      setLoadError('Could not load services. Pull to refresh and try again.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayServices = useMemo(() => services, [services]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>All services</Text>
          <View style={styles.headerRight} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : displayServices.length === 0 ? (
          <Text style={styles.emptyText}>No services available right now.</Text>
        ) : (
          <View style={styles.grid}>
            {displayServices.map((s, idx) => (
              <TouchableOpacity
                key={s.id}
                style={styles.tile}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/search',
                    params: { serviceId: s.id, serviceName: s.name },
                  })
                }
              >
                <View style={[styles.tileIconWrap, { backgroundColor: SERVICE_COLORS[idx % SERVICE_COLORS.length] }]}>
                  <MaterialCommunityIcons name={iconFor(s.name)} size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.tileName} numberOfLines={2}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  safe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    ...appScreenHeaderBarPadding,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerRight: { width: 40, height: 40 },
  title: {
    flex: 1,
    textAlign: 'center',
    ...appScreenHeaderTitleStyle,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  loadingText: { textAlign: 'center', color: '#666', paddingVertical: 24 },
  errorText: { textAlign: 'center', color: '#C62828', paddingVertical: 24 },
  emptyText: { textAlign: 'center', color: '#666', paddingVertical: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#7A7000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 2,
    elevation: 1,
  },
  tileIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileName: { fontSize: 11, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
});
