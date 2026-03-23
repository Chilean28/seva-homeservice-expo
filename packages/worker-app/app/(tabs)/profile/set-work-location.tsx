import {
  APP_SCREEN_HEADER_BG,
  APP_SCREEN_HEADER_PADDING_BOTTOM,
  APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  APP_SCREEN_HEADER_PADDING_TOP_INNER,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import SearchLocationMap, { type SearchLocationMapRef } from '@/components/SearchLocationMap';
import { useWorkLocationSelection } from '@/lib/contexts/WorkLocationSelectionContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_LAT = 37.78;
const DEFAULT_LNG = -122.42;

async function coordsToDisplayName(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    const data = (await res.json()) as {
      display_name?: string;
      address?: { suburb?: string; city?: string; town?: string; state?: string };
    };
    const name = data?.address
      ? [data.address.suburb, data.address.city || data.address.town, data.address.state]
          .filter(Boolean)
          .join(', ') || data.display_name
      : data?.display_name;
    return name || 'Work area';
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export default function SetWorkLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPending } = useWorkLocationSelection();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const paramLat = params.lat != null ? parseFloat(params.lat) : NaN;
  const paramLng = params.lng != null ? parseFloat(params.lng) : NaN;

  const mapRef = useRef<SearchLocationMapRef>(null);
  const [coords, setCoords] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const locationChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!Number.isNaN(paramLat) && !Number.isNaN(paramLng)) {
        if (mounted) setCoords({ lat: paramLat, lng: paramLng });
        const name = await coordsToDisplayName(paramLat, paramLng);
        if (mounted) setCurrentAddress(name);
        if (mounted) setLoading(false);
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            maximumAge: 0,
            enableHighAccuracy: true,
          } as Location.LocationOptions);
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (mounted) setCoords({ lat, lng });
          const name = await coordsToDisplayName(lat, lng);
          if (mounted) setCurrentAddress(name);
        } else if (mounted) {
          setCurrentAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        }
      } catch (e) {
        if (__DEV__) console.warn('Could not get current location:', e);
        if (mounted) setCurrentAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [paramLat, paramLng]);

  useEffect(() => {
    return () => {
      if (locationChangeTimeoutRef.current) clearTimeout(locationChangeTimeoutRef.current);
    };
  }, []);

  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setCoords({ lat, lng });
    setCurrentAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    if (locationChangeTimeoutRef.current) clearTimeout(locationChangeTimeoutRef.current);
    locationChangeTimeoutRef.current = setTimeout(async () => {
      locationChangeTimeoutRef.current = null;
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    }, 400);
  }, []);

  const handlePressMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to center on your position.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        maximumAge: 0,
        enableHighAccuracy: true,
      } as Location.LocationOptions);
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCoords({ lat, lng });
      mapRef.current?.animateToLocation(lat, lng);
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    } catch (e) {
      Alert.alert('Error', 'Could not get your location. Try again.');
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const link = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
    setPending({
      lat: coords.lat,
      lng: coords.lng,
      displayName: currentAddress.trim() || null,
      link,
    });
    router.back();
  }, [coords.lat, coords.lng, currentAddress, setPending, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + APP_SCREEN_HEADER_PADDING_TOP_INNER }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set work location</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Getting location…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + APP_SCREEN_HEADER_PADDING_TOP_INNER }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Set work location</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.currentLocationRow}>
        <Text style={styles.currentLocationLabel}>Pinned location</Text>
        <View style={styles.addressRow}>
          <View style={styles.yellowDot} />
          <Text style={styles.addressText} numberOfLines={3}>
            {currentAddress || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
          </Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <SearchLocationMap
          ref={mapRef}
          initialLat={coords.lat}
          initialLng={coords.lng}
          onLocationChange={handleLocationChange}
          onPressMyLocation={handlePressMyLocation}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.selectButton} onPress={handleConfirm} activeOpacity={0.8}>
          <Text style={styles.selectButtonText}>Confirm location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: APP_SCREEN_HEADER_BG,
    paddingHorizontal: APP_SCREEN_HEADER_PADDING_HORIZONTAL,
    paddingBottom: APP_SCREEN_HEADER_PADDING_BOTTOM,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  headerRight: {
    width: 32,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  currentLocationRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  currentLocationLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yellowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFEB3B',
    marginRight: 8,
  },
  addressText: {
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
    minHeight: 280,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
  },
  selectButton: {
    backgroundColor: '#FFEB3B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
});
