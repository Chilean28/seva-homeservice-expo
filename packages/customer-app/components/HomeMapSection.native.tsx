import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const DEFAULT_MAP_REGION = {
  latitude: 11.5564,
  longitude: 104.9282,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

type Props = {
  currentLocation: { lat: number; lng: number; address: string } | null;
  loadingLocation: boolean;
  onLocationChange: (location: { lat: number; lng: number; address: string }) => void;
};

export default function HomeMapSection({
  currentLocation,
  loadingLocation,
  onLocationChange,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [markerCoord, setMarkerCoord] = useState({
    latitude: DEFAULT_MAP_REGION.latitude,
    longitude: DEFAULT_MAP_REGION.longitude,
  });

  useEffect(() => {
    if (currentLocation) {
      setMarkerCoord({ latitude: currentLocation.lat, longitude: currentLocation.lng });
      mapRef.current?.animateToRegion(
        { latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        1000
      );
    }
  }, [currentLocation?.lat, currentLocation?.lng]);

  return (
    <>
      <View
        style={styles.mapContainer}
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={
            currentLocation
              ? {
                  latitude: currentLocation.lat,
                  longitude: currentLocation.lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : DEFAULT_MAP_REGION
          }
          onPress={(e) => {
            // Preview map on the homepage: user cannot pin/drag here.
            // Tapping just takes them to the full location picker using the currently shown coordinates.
            const { latitude, longitude } = markerCoord;
            onLocationChange({
              lat: latitude,
              lng: longitude,
              address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            });
            router.push({
              pathname: '/search-location',
              params: {
                returnTo: 'home',
                lat: String(markerCoord.latitude),
                lng: String(markerCoord.longitude),
              },
            });
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Marker
            coordinate={markerCoord}
            draggable={false}
            pinColor="red"
          />
        </MapView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 100,
    borderRadius: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
