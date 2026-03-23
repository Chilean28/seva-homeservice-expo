import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  currentLocation: { lat: number; lng: number; address: string } | null;
  loadingLocation: boolean;
  onLocationChange: (location: { lat: number; lng: number; address: string }) => void;
};

export default function HomeMapSection({
  currentLocation,
  loadingLocation,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.mapCard}
      onPress={() => {
        if (currentLocation) {
          router.push({
            pathname: '/search-location',
            params: { returnTo: 'home', lat: String(currentLocation.lat), lng: String(currentLocation.lng) },
          });
        } else {
          router.push({ pathname: '/search-location', params: { returnTo: 'home' } });
        }
      }}
      activeOpacity={0.8}
    >
      <View style={styles.mapCardThumb} />
      <View style={styles.mapCardContent}>
        <View style={styles.mapCardDot} />
        <Text style={styles.mapCardAddress} numberOfLines={2}>
          {loadingLocation
            ? 'Getting location…'
            : currentLocation?.address ?? 'Tap to set location'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#999" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingRight: 12,
  },
  mapCardThumb: {
    width: 72,
    height: '100%',
    backgroundColor: '#C8E6C9',
  },
  mapCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  mapCardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFEB3B',
    marginRight: 8,
  },
  mapCardAddress: {
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
});
