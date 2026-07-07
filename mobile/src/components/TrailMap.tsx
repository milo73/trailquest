import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  PROVIDER_DEFAULT,
} from "react-native-maps";
import { colors } from "../theme";
import type { GeoPoint } from "../api/types";

export interface TrailStop {
  order: number;
  label: string;
  lat: number;
  lon: number;
}

export interface TrailMapProps {
  stops: TrailStop[];
  routeGeometry?: GeoPoint[] | null;
  activeOrder?: number;
  followUser?: boolean;
}

export function TrailMap({
  stops,
  routeGeometry,
  activeOrder,
  followUser = false,
}: TrailMapProps) {
  const mapRef = useRef<MapView>(null);

  const line: { latitude: number; longitude: number }[] =
    routeGeometry && routeGeometry.length > 0
      ? routeGeometry.map((p) => ({ latitude: p.lat, longitude: p.lon }))
      : stops.map((s) => ({ latitude: s.lat, longitude: s.lon }));

  const initialRegion =
    stops.length > 0
      ? {
          latitude: stops[0].lat,
          longitude: stops[0].lon,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : undefined;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        showsUserLocation={followUser}
        initialRegion={initialRegion}
        onMapReady={() => {
          // Guard: the ref may be null under the Jest mock
          if (mapRef.current && stops.length > 0) {
            mapRef.current.fitToCoordinates(
              stops.map((s) => ({ latitude: s.lat, longitude: s.lon })),
              { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false },
            );
          }
        }}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
        />
        {stops.map((stop) => (
          <Marker
            key={stop.order}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
          >
            <View
              style={[
                styles.markerContainer,
                stop.order === activeOrder && styles.markerActive,
              ]}
            >
              <Text style={styles.markerText}>{stop.label}</Text>
            </View>
          </Marker>
        ))}
        <Polyline
          coordinates={line}
          strokeColor={colors.terracotta}
          strokeWidth={4}
        />
      </MapView>
      <Text style={styles.attribution} pointerEvents="none">
        © OpenStreetMap contributors
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    backgroundColor: colors.navy,
    borderRadius: 99,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  markerActive: {
    backgroundColor: colors.terracotta,
  },
  markerText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  attribution: {
    position: "absolute",
    bottom: 4,
    right: 4,
    fontSize: 10,
    color: colors.navy,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
});
