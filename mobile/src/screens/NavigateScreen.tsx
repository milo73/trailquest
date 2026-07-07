import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TrailStop } from "../components/TrailMap";
import { TrailMap } from "../components/TrailMap";
import { AppButton } from "../components/ui";
import { distanceKm, useLocation } from "../location/useLocation";
import { useQuester } from "../store/QuesterStore";
import { colors, spacing } from "../theme";

export function NavigateScreen() {
  const { state, arrive } = useQuester();
  const trail = state.trail!;
  const { position } = useLocation();

  const stops = trail.stops;
  const currentIdx = stops.findIndex((s) => s.order === state.currentOrder);
  const currentStop = stops[currentIdx];
  const total = stops.length;
  const idx = currentIdx + 1;

  const poiName = currentStop.poi.name;
  const target = currentStop.poi.location;

  const distKm =
    position != null ? distanceKm(position, target) : null;
  const isClose = distKm != null && distKm < 0.05;

  const mapStops: TrailStop[] = [
    { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
    ...stops.map((s) => ({
      order: s.order,
      label: String(s.order),
      lat: s.poi.location.lat,
      lon: s.poi.location.lon,
    })),
  ];

  return (
    <View style={styles.container}>
      <TrailMap
        stops={mapStops}
        routeGeometry={trail.route_geometry}
        activeOrder={state.currentOrder}
        followUser
      />

      {/* Header overlay */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Stop {idx}/{total}
        </Text>
        <Text style={styles.poiName}>{poiName}</Text>
        {distKm != null && (
          <Text style={styles.distance}>
            {distKm < 1
              ? `${Math.round(distKm * 1000)} m`
              : `${distKm.toFixed(1)} km`}
          </Text>
        )}
        {isClose && (
          <Text style={styles.nearbyHint}>Je bent er bijna</Text>
        )}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <AppButton title="Ik ben er" onPress={arrive} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: spacing(6),
    left: spacing(2),
    right: spacing(2),
    backgroundColor: "rgba(250,246,236,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.5),
    zIndex: 10,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.navy,
  },
  poiName: {
    fontSize: 18,
    fontWeight: "400",
    color: colors.navy,
    marginTop: 4,
  },
  distance: {
    fontSize: 14,
    color: colors.navy,
    opacity: 0.8,
    marginTop: 4,
  },
  nearbyHint: {
    fontSize: 13,
    color: colors.terracotta,
    fontWeight: "600",
    marginTop: 4,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing(2),
    paddingBottom: spacing(4),
    zIndex: 10,
  },
});
