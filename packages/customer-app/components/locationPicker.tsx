import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const DEFAULT_REGION = {
  latitude: 40.7,
  longitude: -73.99,
};

export interface LocationPickerProps {
  initialLocation?: { latitude: number; longitude: number };
  onLocationChange?: (location: { latitude: number; longitude: number }) => void;
  onConfirm?: (location: { latitude: number; longitude: number }) => void;
  containerStyle?: object;
  showActions?: boolean;
}

export default function LocationPicker({
  initialLocation = DEFAULT_REGION,
  onLocationChange,
  onConfirm,
  containerStyle,
  showActions = true,
}: LocationPickerProps) {
  const [markerCoord, setMarkerCoord] = useState(initialLocation);
  const [loadingLocation, setLoadingLocation] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setMarkerCoord(coords);
          onLocationChange?.(coords);
        }
      } catch (e) {
        console.warn('Could not get current location:', e);
      }
      if (mounted) setLoadingLocation(false);
    })();
    return () => { mounted = false; };
  }, []);

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${markerCoord.latitude},${markerCoord.longitude}`;

  return (
    <View style={[styles.placeholder, containerStyle]}>
      <View style={styles.placeholderInner}>
        <Text style={styles.placeholderText}>
          Tap Open in Maps below to view or change location.
        </Text>
        <Text style={styles.placeholderSubtext}>
          {markerCoord.latitude.toFixed(4)}, {markerCoord.longitude.toFixed(4)}
        </Text>
        {showActions && (
          <>
            <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(mapUrl)}>
              <Text style={styles.buttonText}>Open in Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => onConfirm?.(markerCoord)}
              disabled={loadingLocation}
            >
              <Text style={styles.buttonText}>Confirm location</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 200,
  },
  placeholderInner: {
    flex: 1,
    backgroundColor: '#C8E6C9',
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '600',
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 13,
    color: '#388E3C',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
