import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { TrailStop } from "../components/TrailMap";
import { TrailMap } from "../components/TrailMap";
import { AppButton, Card } from "../components/ui";
import { useQuester } from "../store/QuesterStore";
import { colors, spacing } from "../theme";

function formatKm(km: number): string {
  return km.toFixed(1).replace(".", ",");
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u${String(m).padStart(2, "0")}`;
}

export function PreviewScreen() {
  const { state, startWalk } = useQuester();
  const trail = state.trail!;

  const mapStops: TrailStop[] = [
    { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
    ...trail.stops.map((s) => ({
      order: s.order,
      label: String(s.order),
      lat: s.poi.location.lat,
      lon: s.poi.location.lon,
    })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <TrailMap stops={mapStops} routeGeometry={trail.route_geometry} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>JE SPEURTOCHT IS KLAAR</Text>
        <Text style={styles.title}>
          {trail.city} · {trail.theme}
        </Text>

        {/* Stats */}
        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatKm(trail.actual_distance_km)}</Text>
              <Text style={styles.statLabel}>KM</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(trail.estimated_duration_min)}</Text>
              <Text style={styles.statLabel}>DUUR</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{trail.stops.length}</Text>
              <Text style={styles.statLabel}>STOPS</Text>
            </View>
          </View>
        </Card>

        {/* Attributions */}
        {trail.attributions.length > 0 && (
          <View style={styles.attributions}>
            {trail.attributions.map((attr, i) => (
              <Text key={i} style={styles.attribution}>
                {attr}
              </Text>
            ))}
          </View>
        )}

        <AppButton title="Start" onPress={startWalk} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  mapContainer: {
    height: 260,
  },
  content: {
    padding: spacing(2),
    gap: spacing(2),
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.terracotta,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 26,
    fontWeight: "400",
    color: colors.navy,
  },
  statsCard: {
    padding: 0,
    overflow: "hidden",
  },
  statsRow: {
    flexDirection: "row",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing(2),
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "400",
    color: colors.navy,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.navy,
    opacity: 0.6,
    marginTop: 4,
    letterSpacing: 1,
  },
  attributions: {
    gap: spacing(0.5),
  },
  attribution: {
    fontSize: 11,
    color: colors.navy,
    opacity: 0.6,
  },
});
