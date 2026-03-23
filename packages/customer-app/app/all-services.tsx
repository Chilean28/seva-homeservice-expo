import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function AllServicesSheet() {
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const translateY = useState(() => new Animated.Value(0))[0];
  const [dragEnabled, setDragEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayServices = useMemo(
    () =>
      services.length
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
          ] as ServiceRow[]),
    [services]
  );

  const sheetPadBottom = Math.max(insets.bottom, 16) + 18;
  const closeThreshold = 110;
  const dragRange = 260;
  const translateYClamped = translateY.interpolate({
    inputRange: [0, dragRange],
    outputRange: [0, dragRange],
    extrapolate: 'clamp',
  });

  const backdropOpacity = translateYClamped.interpolate({
    inputRange: [0, dragRange],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const resetSheet = () => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
  };

  const closeSheet = () => {
    Animated.timing(translateY, {
      toValue: dragRange,
      duration: 160,
      useNativeDriver: true,
    }).start(() => router.back());
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => dragEnabled && g.dy > 4 && Math.abs(g.dx) < 12,
        onPanResponderMove: (_, g) => {
          if (g.dy <= 0) return;
          translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > closeThreshold || g.vy > 1.2) closeSheet();
          else resetSheet();
        },
        onPanResponderTerminate: () => resetSheet(),
      }),
    [closeThreshold, closeSheet, dragEnabled, resetSheet, translateY]
  );

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      <Animated.View
        style={[styles.sheet, { paddingBottom: sheetPadBottom, transform: [{ translateY: translateYClamped }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.sheetHeader}>
          <Text style={styles.title}>All services</Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color="#000" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => setDragEnabled(false)}
          onScrollEndDrag={() => setDragEnabled(true)}
        >
          {loading && services.length === 0 ? (
            <Text style={styles.loadingText}>Loading…</Text>
          ) : (
            <View style={styles.grid}>
              {displayServices.map((s, idx) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.tile}
                  activeOpacity={0.85}
                  onPress={() => {
                    router.back();
                    router.push({
                      pathname: '/search',
                      params: { serviceId: s.id, serviceName: s.name },
                    });
                  }}
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    height: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6D6D6',
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#000' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  loadingText: { textAlign: 'center', color: '#666', paddingVertical: 24 },
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
  tileName: { fontSize: 11, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
});

