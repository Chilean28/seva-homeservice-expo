import { getInitials } from '@/lib/avatar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useLocationSelection } from '@/lib/contexts/LocationSelectionContext';
import { supabase } from '@/lib/supabase/client';
import { fetchWorkerIdsWithUpcomingAvailability } from '@/lib/workerDiscovery';
import { useRefreshOnAppActive } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import HomeMapSection from '@/components/HomeMapSection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type ServiceRow = { id: string; name: string; base_price: number };

export type WorkerService = {
  serviceId: string;
  serviceName: string;
  price: number;
  priceLabel: string;
};

const RADIUS_KM = 15;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatGeneralLocationFromGeocode(
  result: Location.LocationGeocodedAddress | null | undefined,
  lat: number,
  lng: number
): string {
  if (!result) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const parts = [result.district, result.city, result.region, result.country]
    .filter((p): p is string => Boolean(p && p.trim()))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return parts.length ? parts.join(', ') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

type WorkerWithServices = {
  id: string;
  workerId: string;
  workerName: string;
  avatarUrl: string | null;
  services: WorkerService[];
  rating: number;
  jobsCompleted: number;
  latitude?: number | null;
  longitude?: number | null;
};

type WorkerProfileRow = {
  id: string;
  rating_average: number;
  total_jobs_completed: number;
  latitude?: number | null;
  longitude?: number | null;
  users: { full_name: string; avatar_url: string | null } | null;
  service_subscriptions: Array<{
    service_id: string;
    custom_price: number | null;
    services: { name: string; base_price: number } | null;
  }>;
};

function groupWorkersWithServices(workers: WorkerProfileRow[]): WorkerWithServices[] {
  return (workers ?? [])
    .filter((w) => (w.service_subscriptions?.length ?? 0) > 0)
    .map((w) => {
      const name = w.users?.full_name ?? 'Worker';
      const avatarUrl = w.users?.avatar_url ?? null;
      const rating = Number(w.rating_average) || 0;
      const jobsCompleted = Number(w.total_jobs_completed) || 0;
      const services: WorkerService[] = (w.service_subscriptions ?? []).map((sub) => {
        const serviceName = sub.services?.name ?? 'Service';
        const basePrice = sub.services?.base_price ?? 0;
        const price = sub.custom_price != null ? Number(sub.custom_price) : Number(basePrice);
        return {
          serviceId: sub.service_id,
          serviceName,
          price,
          priceLabel: `$${price.toFixed(2)}`,
        };
      });
      return {
        id: w.id,
        workerId: w.id,
        workerName: name,
        avatarUrl,
        services,
        rating,
        jobsCompleted,
        latitude: w.latitude != null ? Number(w.latitude) : null,
        longitude: w.longitude != null ? Number(w.longitude) : null,
      };
    });
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { getAndClearPendingLocationSelection } = useLocationSelection();
  const userName = user?.user_metadata?.full_name?.split(' ')[0] || 'Guest';
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<WorkerWithServices[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const realtimeRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locationSummary = useMemo(() => {
    if (loadingLocation) return 'Getting location…';
    const addr = currentLocation?.address?.trim();
    if (!addr) return 'Tap map to set location';
    const rawParts = addr.split(',').map((p) => p.trim()).filter(Boolean);
    const parts: string[] = [];
    for (const p of rawParts) {
      const prev = parts[parts.length - 1];
      if (prev && prev.localeCompare(p, undefined, { sensitivity: 'base' }) === 0) continue;
      parts.push(p);
      if (parts.length >= 2) break;
    }
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return parts[0] ?? addr;
  }, [currentLocation?.address, loadingLocation]);

  useFocusEffect(
    useCallback(() => {
      const pending = getAndClearPendingLocationSelection();
      if (pending) {
        setCurrentLocation({ lat: pending.lat, lng: pending.lng, address: pending.address });
      }
    }, [getAndClearPendingLocationSelection])
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (user?.id) {
        const { data } = await supabase
          .from('customer_addresses')
          .select('address, latitude, longitude')
          .eq('customer_id', user.id)
          .eq('is_default', true)
          .maybeSingle();
        const loc = data as { address: string; latitude: number; longitude: number } | null;
        if (mounted && loc?.address && loc?.latitude != null && loc?.longitude != null) {
          setCurrentLocation({
            lat: Number(loc.latitude),
            lng: Number(loc.longitude),
            address: loc.address,
          });
          setLoadingLocation(false);
          return;
        }
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          let generalAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            generalAddress = formatGeneralLocationFromGeocode(geo, lat, lng);
          } catch {
            // Fallback to coordinates if reverse geocode fails.
          }
          setCurrentLocation({
            lat,
            lng,
            address: generalAddress,
          });
        }
      } catch (e) {
        console.warn('Could not get current location:', e);
      }
      if (mounted) setLoadingLocation(false);
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('services')
      .select('id, name, base_price')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.length) {
          setServices(data as ServiceRow[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDeals = useCallback(() => {
    const lat = currentLocation?.lat;
    const lng = currentLocation?.lng;
    if (loadingLocation || lat == null || lng == null) {
      setAvailableWorkers([]);
      setLoadingDeals(false);
      return;
    }
    setLoadingDeals(true);
    Promise.all([
      supabase
        .from('worker_profiles')
        .select(
          `
        id,
        latitude,
        longitude,
        rating_average,
        total_jobs_completed,
        users (full_name, avatar_url),
        service_subscriptions (service_id, custom_price, services (name, base_price))
      `
        )
        .eq('is_available', true),
      fetchWorkerIdsWithUpcomingAvailability(),
    ]).then(([{ data, error }, upcomingIds]) => {
      setLoadingDeals(false);
      if (!error && data?.length) {
        let rows = data as WorkerProfileRow[];
        if (upcomingIds) {
          rows = rows.filter((w) => upcomingIds.has(w.id));
        }
        const grouped = groupWorkersWithServices(rows);
        const filtered = grouped.filter((w) => {
          if (w.latitude == null || w.longitude == null) return false;
          const dKm = haversineKm(lat, lng, w.latitude, w.longitude);
          return dKm <= RADIUS_KM;
        });
        setAvailableWorkers(filtered);
      } else {
        setAvailableWorkers([]);
      }
    });
  }, [currentLocation?.lat, currentLocation?.lng, loadingLocation]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  useRefreshOnAppActive(fetchDeals);

  useEffect(() => {
    const scheduleRefetch = () => {
      if (realtimeRefetchTimer.current) clearTimeout(realtimeRefetchTimer.current);
      // Debounce bursts of profile/subscription updates into one refresh.
      realtimeRefetchTimer.current = setTimeout(() => {
        fetchDeals();
      }, 300);
    };

    const channel = supabase
      .channel('home-workers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_profiles' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_subscriptions' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, scheduleRefetch)
      .subscribe();

    return () => {
      if (realtimeRefetchTimer.current) {
        clearTimeout(realtimeRefetchTimer.current);
        realtimeRefetchTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [fetchDeals]);

  const onServicePress = useCallback(
    (service: ServiceRow) => {
      router.push({
        pathname: '/search',
        params: {
          serviceId: service.id,
          serviceName: service.name,
          ...(currentLocation?.lat != null && currentLocation?.lng != null
            ? { lat: String(currentLocation.lat), lng: String(currentLocation.lng) }
            : {}),
        },
      });
    },
    [currentLocation?.lat, currentLocation?.lng]
  );

  const onWorkerPress = useCallback((worker: WorkerWithServices) => {
    router.push({
      pathname: '/worker/[id]',
      params: { id: worker.workerId },
    });
  }, []);

  const displayServices = services.length > 0
    ? services
    : ([
        { id: '1', name: 'Cleaning', base_price: 25 },
        { id: '2', name: 'Mounting/Assembly', base_price: 55.5 },
        { id: '3', name: 'Handyman', base_price: 45 },
        { id: '4', name: 'Plumbing', base_price: 65 },
        { id: '5', name: 'Electrical', base_price: 70 },
        { id: '6', name: 'Moving', base_price: 50 },
        { id: '7', name: 'Pest Control', base_price: 80 },
        { id: '8', name: 'Landscaping', base_price: 40 },
        { id: '9', name: 'Painting', base_price: 55 },
        { id: '10', name: 'Appliance Repair/Installation', base_price: 60 },
        { id: '11', name: 'Aircon Service (AC Cleaning)', base_price: 65 },
        { id: '12', name: 'Smart Home / CCTV Installation', base_price: 55 },
      ] as ServiceRow[]);

  const serviceColumns = useMemo(() => {
    const cols: Array<{ key: string; items: Array<{ service: ServiceRow; index: number }> }> = [];
    for (let i = 0; i < displayServices.length; i += 2) {
      cols.push({
        key: `col-${i}`,
        items: [
          { service: displayServices[i], index: i },
          ...(displayServices[i + 1]
            ? [{ service: displayServices[i + 1], index: i + 1 }]
            : []),
        ],
      });
    }
    return cols;
  }, [displayServices]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Yellow Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Welcome back, {userName}!</Text>
            </View>
            <TouchableOpacity
              style={styles.notificationIcon}
              onPress={() => router.push('/notifications' as Parameters<typeof router.push>[0])}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <TouchableOpacity
            style={styles.searchBox}
            onPress={() => router.push('/search')}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#999" />
            <Text style={styles.searchPlaceholder}>What do you need help with</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          {/* My Current Address - native: MapView (HomeMapSection.native), web: card only (HomeMapSection.web) */}
          <View style={styles.section}>
            <View style={styles.locationHeader}>
              <Text style={[styles.sectionTitle, styles.locationTitle]}>My Current Address</Text>
              <Text style={styles.locationSummary} numberOfLines={1}>
                {locationSummary}
              </Text>
            </View>
            <HomeMapSection
              currentLocation={currentLocation}
              loadingLocation={loadingLocation}
              onLocationChange={setCurrentLocation}
            />
          </View>

          {/* Available Services Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, styles.sectionTitleInHeader]}>Available Services</Text>
              <TouchableOpacity onPress={() => router.push('/all-services' as never)} activeOpacity={0.8}>
                <Text style={styles.viewAll}>View all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={serviceColumns}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(c) => c.key}
              contentContainerStyle={styles.servicesColumnsRow}
              ItemSeparatorComponent={() => <View style={styles.serviceColumnSeparator} />}
              snapToInterval={98}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              removeClippedSubviews
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
              updateCellsBatchingPeriod={40}
              getItemLayout={(_, index) => ({ length: 98, offset: 98 * index, index })}
              renderItem={({ item: col }) => (
                <View style={styles.serviceColumn}>
                  {col.items.map(({ service, index }) => (
                    <TouchableOpacity
                      key={service.id}
                      style={styles.serviceCard}
                      onPress={services.length > 0 ? () => onServicePress(service) : undefined}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.serviceIconWrap, { backgroundColor: SERVICE_COLORS[index % SERVICE_COLORS.length] }]}>
                        <MaterialCommunityIcons name={iconFor(service.name)} size={22} color="#FFFFFF" />
                      </View>
                      <Text style={styles.serviceName} numberOfLines={2}>
                        {service.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            />
          </View>

          {/* Available Workers Near You (Top Deals) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Workers Near You</Text>
            </View>
            {loadingDeals ? (
              <Text style={styles.dealsEmpty}>Loading...</Text>
            ) : availableWorkers.length === 0 ? (
              <Text style={styles.dealsEmpty}>No workers available right now. Check back later.</Text>
            ) : (
              <FlatList
                data={availableWorkers}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.dealsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dealCard}
                    onPress={() => onWorkerPress(item)}
                    activeOpacity={0.8}
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarInitials}>{getInitials(item.workerName)}</Text>
                      </View>
                    )}
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={12} color="#4CAF50" />
                      <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
                      <Text style={styles.reviews}>({item.jobsCompleted} jobs)</Text>
                    </View>
                    <Text style={styles.dealName} numberOfLines={1}>{item.workerName}</Text>
                    <Text style={styles.dealServices} numberOfLines={2}>
                      {item.services.map((s) => `${s.serviceName} ${s.priceLabel}`).join('  •  ')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Recommended Workers */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended For You</Text>
            {loadingDeals ? (
              <Text style={styles.dealsEmpty}>Loading...</Text>
            ) : availableWorkers.length === 0 ? (
              null
            ) : (
              availableWorkers.slice(0, 6).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentCard}
                  onPress={() => onWorkerPress(item)}
                  activeOpacity={0.8}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitials}>{getInitials(item.workerName)}</Text>
                    </View>
                  )}
                  <View style={styles.recentContent}>
                    <View style={styles.recentTopRow}>
                      <Text style={styles.recentName} numberOfLines={1}>{item.workerName}</Text>
                      <View style={styles.recentRatingRight}>
                        <Ionicons name="star" size={12} color="#4CAF50" />
                        <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
                        <Text style={styles.reviews}>({item.jobsCompleted} jobs)</Text>
                      </View>
                    </View>
                    <Text style={styles.recentServices} numberOfLines={2}>
                      {item.services.map((s) => `${s.serviceName} ${s.priceLabel}`).join('  •  ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFEB3B',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFEB3B',
  },
  header: {
    backgroundColor: '#FFEB3B',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 4,
  },
  time: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconMargin: {
    marginLeft: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  notificationIcon: {
    padding: 4,
  },
  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchPlaceholder: {
    marginLeft: 12,
    fontSize: 16,
    color: '#999',
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    paddingBottom: 100,
  },
  section: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  sectionTitleInHeader: { marginBottom: 0 },
  locationHeader: { marginBottom: 12 },
  locationTitle: { marginBottom: 4 },
  locationSummary: { fontSize: 13, color: '#666' },
  seeMore: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  viewAll: {
    fontSize: 14,
    color: '#666',
    fontWeight: '700',
  },
  servicesGrid: {
    flexDirection: 'row',
  },
  serviceCard: {
    width: 86,
    height: 86,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#7A7000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  serviceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  servicesColumnsRow: {
    paddingRight: 16,
    paddingLeft: 0,
  },
  serviceColumn: {
    gap: 12,
  },
  serviceColumnSeparator: { width: 12 },
  dealsList: {
    paddingRight: 16,
  },
  dealsEmpty: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },
  dealCard: {
    width: 160,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 22, fontWeight: '600', color: '#666' },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  rating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 4,
  },
  reviews: {
    fontSize: 10,
    color: '#666',
    marginLeft: 4,
  },
  dealName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginTop: 4,
  },
  dealService: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  dealServices: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  dealPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 4,
  },
  recentCard: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  recentContent: {
    flex: 1,
    marginLeft: 12,
  },
  recentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  recentRatingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginTop: 4,
    flex: 1,
    marginRight: 8,
  },
  recentService: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  recentServices: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    lineHeight: 18,
  },
  recentPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 4,
  },
});
