import { getInitials } from '@/lib/avatar';
import { supabase } from '@/lib/supabase/client';
import {
  fetchWorkerIdsForSearch,
  type SearchDateFilter,
  type SearchTimeFilter,
} from '@/lib/workerDiscovery';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding } from '@seva/shared';
import { useAuth } from '@/lib/contexts/AuthContext';

type SortBy = 'recommended' | 'lowest_price' | 'highest_price' | 'top_pros';
type DateFilter = SearchDateFilter;
type TimeFilter = SearchTimeFilter;

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'lowest_price', label: 'Lowest Price' },
  { id: 'highest_price', label: 'Highest Price' },
  { id: 'top_pros', label: 'Top Pros' },
];

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'today', label: 'Today' },
  { id: 'within_3_days', label: 'Within 3 Days' },
  { id: 'within_week', label: 'Within a week' },
];

const TIME_OPTIONS: { id: TimeFilter; label: string }[] = [
  { id: 'flexible', label: 'Flexible' },
  { id: 'morning', label: 'Morning (8-11)' },
  { id: 'afternoon', label: 'Afternoon (12-3)' },
  { id: 'evening', label: 'Evening (4-8)' },
];

const PRICE_STEPS = [0, 25, 50, 75, 100, 150];
const MAX_PRICE_DEFAULT = 150;
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

const RECENT_SEARCHES_KEY = '@customer_recent_searches';
const MAX_RECENT = 10;

const CATEGORIES = ['All', 'Cleaning', 'Moving', 'Outdoor', 'HandyMan'];

const POPULAR_SEARCHES = [
  'Cleaning',
  'Handyman',
  'Plumbing',
  'Moving',
  'Mounting service',
  'Electrical',
  'Landscaping',
  'Painting',
  'Pest Control',
  'Appliance Repair',
  'Aircon Service',
  'CCTV Installation',
];

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

export type WorkerService = {
  serviceId: string;
  serviceName: string;
  price: number;
  priceLabel: string;
};

export type WorkerWithServices = {
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

function categoryMatchesService(category: string, serviceName: string): boolean {
  if (category === 'All') return true;
  const s = serviceName.toLowerCase();
  const c = category.toLowerCase();
  if (c === 'cleaning') return s.includes('clean');
  if (c === 'moving') return s.includes('mov');
  if (c === 'outdoor') return s.includes('outdoor') || s.includes('landscap');
  if (c === 'handyman') return s.includes('handyman') || s.includes('handy');
  return s.includes(c);
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ serviceId?: string; serviceName?: string; lat?: string; lng?: string }>();
  const initialServiceId = params.serviceId ?? undefined;
  const initialServiceName = params.serviceName ?? undefined;
  const { user } = useAuth();
  const paramLat = params.lat != null ? parseFloat(params.lat) : NaN;
  const paramLng = params.lng != null ? parseFloat(params.lng) : NaN;
  const coordsFromParams =
    Number.isFinite(paramLat) && Number.isFinite(paramLng) ? { lat: paramLat, lng: paramLng } : null;

  const [query, setQuery] = useState(initialServiceName ?? '');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [workers, setWorkers] = useState<WorkerWithServices[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(coordsFromParams);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [sortFilterVisible, setSortFilterVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('recommended');
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('flexible');
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE_DEFAULT);
  /** After “Apply” on Sort & Filter, show results and scroll to the list */
  const [resultsUnlocked, setResultsUnlocked] = useState(
    () => !!(initialServiceName?.trim() || initialServiceId)
  );
  const scrollRef = useRef<ScrollView>(null);
  const resultsSectionY = useRef(0);
  const pendingScrollToResultsRef = useRef(false);

  const loadRecentSearches = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setRecentSearches(Array.isArray(list) ? list : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const addRecentSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [trimmed, ...(Array.isArray(list) ? list.filter((t) => t !== trimmed) : [])].slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadRecentSearches();
  }, [loadRecentSearches]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (coordsFromParams) {
        setUserCoords(coordsFromParams);
        return;
      }
      if (!user?.id) {
        setUserCoords(null);
        return;
      }
      const { data } = await supabase
        .from('customer_addresses')
        .select('latitude, longitude')
        .eq('customer_id', user.id)
        .eq('is_default', true)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { latitude?: number | null; longitude?: number | null } | null;
      if (row?.latitude != null && row?.longitude != null) {
        setUserCoords({ lat: Number(row.latitude), lng: Number(row.longitude) });
      } else {
        setUserCoords(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, coordsFromParams]);

  useEffect(() => {
    let cancelled = false;
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
      fetchWorkerIdsForSearch(dateFilter, timeFilter),
    ]).then(([{ data, error }, upcomingIds]) => {
      if (cancelled) return;
      setLoadingDeals(false);
      if (!error && data?.length) {
        let rows = data as WorkerProfileRow[];
        if (upcomingIds) {
          rows = rows.filter((w) => upcomingIds.has(w.id));
        }
        setWorkers(groupWorkersWithServices(rows));
      } else {
        setWorkers([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dateFilter, timeFilter]);

  const filteredWorkers = useMemo(() => {
    let list = workers.filter((w) => {
      if (userCoords) {
        if (w.latitude == null || w.longitude == null) return false;
        const dKm = haversineKm(userCoords.lat, userCoords.lng, w.latitude, w.longitude);
        if (dKm > RADIUS_KM) return false;
      }
      const hasMatchingService = w.services.some((s) => {
        if (initialServiceId && s.serviceId !== initialServiceId) return false;
        if (!categoryMatchesService(selectedCategory, s.serviceName)) return false;
        if (maxPrice > 0 && s.price > maxPrice) return false;
        return true;
      });
      if (!hasMatchingService) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const nameMatch = w.workerName.toLowerCase().includes(q);
        const serviceMatch = w.services.some((s) => s.serviceName.toLowerCase().includes(q));
        if (!nameMatch && !serviceMatch) return false;
      }
      return true;
    });
    if (sortBy === 'lowest_price') {
      list = [...list].sort((a, b) => {
        const minA = Math.min(...a.services.map((s) => s.price));
        const minB = Math.min(...b.services.map((s) => s.price));
        return minA - minB;
      });
    } else if (sortBy === 'highest_price') {
      list = [...list].sort((a, b) => {
        const maxA = Math.max(...a.services.map((s) => s.price));
        const maxB = Math.max(...b.services.map((s) => s.price));
        return maxB - maxA;
      });
    } else if (sortBy === 'top_pros') {
      list = [...list].sort((a, b) => {
        const scoreA = a.rating * 2 + Math.min(a.jobsCompleted / 10, 5);
        const scoreB = b.rating * 2 + Math.min(b.jobsCompleted / 10, 5);
        return scoreB - scoreA;
      });
    }
    return list;
  }, [workers, selectedCategory, query, maxPrice, sortBy, initialServiceId, userCoords]);

  const runSearch = useCallback(
    (term: string) => {
      setQuery(term);
      addRecentSearch(term);
      Keyboard.dismiss();
    },
    [addRecentSearch]
  );

  const onWorkerPress = useCallback((worker: WorkerWithServices) => {
    router.push({
      pathname: '/worker/[id]',
      params: { id: worker.workerId },
    });
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
  }, []);

  const clearAllFilters = useCallback(() => {
    setSortBy('recommended');
    setDateFilter('any');
    setTimeFilter('flexible');
    setMaxPrice(MAX_PRICE_DEFAULT);
    setResultsUnlocked(false);
  }, []);

  const scrollToResultsSection = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, resultsSectionY.current - 8),
      animated: true,
    });
  }, []);

  const applySortFilter = useCallback(() => {
    setSortFilterVisible(false);
    pendingScrollToResultsRef.current = true;
    setResultsUnlocked(true);
    // If results were already on screen, layout may not fire again — scroll after a tick.
    setTimeout(() => {
      if (pendingScrollToResultsRef.current && resultsSectionY.current > 0) {
        pendingScrollToResultsRef.current = false;
        scrollToResultsSection();
      }
    }, 320);
  }, [scrollToResultsSection]);

  const showResults =
    resultsUnlocked || query.trim().length > 0 || selectedCategory !== 'All' || !!initialServiceId;
  const showSuggestions = !showResults;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <View style={styles.searchInputRow}>
              <Ionicons name="search" size={22} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="What do you need help with"
                placeholderTextColor="#999"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => runSearch(query)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 ? (
                <TouchableOpacity onPress={clearQuery} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close-circle" size={22} color="#999" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.sortFilterBtn}
              onPress={() => setSortFilterVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={24} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <Modal
        visible={sortFilterVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSortFilterVisible(false)}
      >
        <View style={styles.modalWrapper}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSortFilterVisible(false)}
          />
          <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sort & Filter</Text>
            <View style={styles.modalHeaderRight}>
              <TouchableOpacity onPress={clearAllFilters} style={styles.clearAllBtn}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSortFilterVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Sort By</Text>
              <View style={styles.filterChipRow}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterChip, sortBy === opt.id && styles.filterChipSelected]}
                    onPress={() => setSortBy(opt.id)}
                  >
                    <Text style={[styles.filterChipText, sortBy === opt.id && styles.filterChipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Choose Dates</Text>
              <View style={styles.filterChipRow}>
                {DATE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterChip, dateFilter === opt.id && styles.filterChipSelected]}
                    onPress={() => setDateFilter(opt.id)}
                  >
                    <Text style={[styles.filterChipText, dateFilter === opt.id && styles.filterChipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Choose Time</Text>
              <View style={styles.filterChipRow}>
                {TIME_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterChip, timeFilter === opt.id && styles.filterChipSelected]}
                    onPress={() => setTimeFilter(opt.id)}
                  >
                    <Text style={[styles.filterChipText, timeFilter === opt.id && styles.filterChipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Price Range</Text>
              <View style={styles.priceSliderTrack}>
                <View style={[styles.priceSliderFill, { width: `${(maxPrice / 150) * 100}%` }]} />
              </View>
              <View style={styles.priceChipsRow}>
                {PRICE_STEPS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.priceChip, maxPrice === p && styles.filterChipSelected]}
                    onPress={() => setMaxPrice(p)}
                  >
                    <Text style={[styles.priceChipText, maxPrice === p && styles.filterChipTextSelected]}>
                      {p === 0 ? 'Any' : p === 150 ? '$150+' : `$${p}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.applyFilterBtn} onPress={applySortFilter} activeOpacity={0.8}>
              <Text style={styles.applyFilterBtnText}>
                {filteredWorkers.length} {filteredWorkers.length === 1 ? 'Tasker' : 'Taskers'} Found
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </Modal>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {showSuggestions && (
          <>
            {/* Recent Search */}
            {recentSearches.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Search</Text>
                <View style={styles.wrapRow}>
                  {recentSearches.map((term) => (
                    <TouchableOpacity
                      key={term}
                      style={styles.chipOutline}
                      onPress={() => runSearch(term)}
                    >
                      <Text style={styles.chipOutlineText}>{term}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Popular Search */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Popular Search</Text>
              <View style={styles.wrapRow}>
                {POPULAR_SEARCHES.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={styles.chipOutline}
                    onPress={() => runSearch(term)}
                  >
                    <Text style={styles.chipOutlineText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Search results */}
        {showResults && (
          <View
            style={styles.section}
            onLayout={(e) => {
              resultsSectionY.current = e.nativeEvent.layout.y;
              if (pendingScrollToResultsRef.current && resultsSectionY.current > 0) {
                pendingScrollToResultsRef.current = false;
                requestAnimationFrame(scrollToResultsSection);
              }
            }}
          >
            <Text style={styles.sectionTitle}>
              {initialServiceName
                ? `Workers for ${initialServiceName}`
                : query.trim()
                  ? 'Search results'
                  : `${selectedCategory} results`}
            </Text>
            {loadingDeals ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : filteredWorkers.length === 0 ? (
              <Text style={styles.emptyText}>No workers match your search.</Text>
            ) : (
              filteredWorkers.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.resultCard}
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
                  <View style={styles.resultContent}>
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={12} color="#4CAF50" />
                      <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
                      <Text style={styles.reviews}>({item.jobsCompleted} jobs)</Text>
                    </View>
                    <Text style={styles.resultName} numberOfLines={1}>{item.workerName}</Text>
                    <Text style={styles.resultServices} numberOfLines={2}>
                      {item.services.map((s) => `${s.serviceName} ${s.priceLabel}`).join(' · ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerSafe: {
    backgroundColor: APP_SCREEN_HEADER_BG,
  },
  header: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    fontSize: 16,
    color: '#000',
    paddingVertical: 0,
  },
  sortFilterBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  clearAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  clearAllText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  modalScroll: {
    maxHeight: 400,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  filterChipSelected: {
    backgroundColor: '#FFEB3B',
    borderColor: '#F9A825',
  },
  filterChipText: {
    fontSize: 15,
    color: '#333',
  },
  filterChipTextSelected: {
    fontWeight: '600',
    color: '#000',
  },
  priceSliderTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5E5',
    marginBottom: 16,
    overflow: 'hidden',
  },
  priceSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#FFEB3B',
    borderRadius: 4,
  },
  priceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  priceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  priceChipText: {
    fontSize: 14,
    color: '#333',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  applyFilterBtn: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  applyFilterBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipSelected: {
    backgroundColor: '#FFEB3B',
    borderColor: '#F9A825',
  },
  chipText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  chipTextSelected: {
    fontWeight: '600',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chipOutline: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipOutlineText: {
    fontSize: 15,
    color: '#000',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    paddingVertical: 20,
  },
  resultCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 18, fontWeight: '600', color: '#666' },
  resultContent: {
    flex: 1,
    marginLeft: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 4,
  },
  reviews: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginTop: 4,
  },
  resultService: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  resultServices: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  resultPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 4,
  },
});
