import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { deriveBadges } from "../gamification";
import { AppButton, Badge, Card } from "../components/ui";
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

export function FinishScreen() {
  const { state, reset } = useQuester();
  const trail = state.trail!;
  const badges = deriveBadges(trail, Object.values(state.solves));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero section */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>TOCHT VOLTOOID</Text>
        <Text style={styles.heroTitle}>Goed gedaan!</Text>
        <View style={styles.pointsRow}>
          <Text style={styles.pointsValue}>{state.points}</Text>
          <Text style={styles.pointsLabel}>punten</Text>
        </View>
      </View>

      {/* Badges */}
      {badges.length > 0 && (
        <Card>
          <Text style={styles.sectionLabel}>Verdiende badges</Text>
          <View style={styles.badges}>
            {badges.map((badge) => (
              <Badge key={badge.id} label={badge.label} />
            ))}
          </View>
        </Card>
      )}

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
            <Text style={styles.statValue}>
              {trail.stops.length}/{trail.stops.length}
            </Text>
            <Text style={styles.statLabel}>STOPS</Text>
          </View>
        </View>
      </Card>

      <AppButton title="Nieuwe tocht" onPress={reset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing(2),
    gap: spacing(2),
    paddingBottom: spacing(4),
  },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    padding: spacing(3),
    alignItems: "center",
    gap: spacing(1),
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f0c0b8",
    letterSpacing: 2,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "400",
    color: colors.white,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing(1),
    marginTop: spacing(1),
  },
  pointsValue: {
    fontSize: 48,
    fontWeight: "400",
    color: colors.white,
  },
  pointsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#aeb9d2",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.navy,
    opacity: 0.6,
    letterSpacing: 1,
    marginBottom: spacing(1),
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(1),
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
    fontSize: 20,
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
});
