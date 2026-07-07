import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { getTrail, listTrails } from "../api/trails";
import type { Trail } from "../api/types";
import { AppButton, Card } from "../components/ui";
import { useQuester } from "../store/QuesterStore";
import { colors, spacing } from "../theme";

export function BrowseScreen() {
  const { setTrail } = useQuester();
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTrails()
      .then((data) => {
        if (!cancelled) {
          setTrails(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Kon de tochten niet laden.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePlay(trail: Trail) {
    setLoadingId(trail.id);
    try {
      const full = await getTrail(trail.id);
      setTrail(full);
    } catch {
      setLoadingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>TrailQuest</Text>
      </View>

      <Text style={styles.title}>Kies een tocht</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {loading && (
          <ActivityIndicator
            color={colors.terracotta}
            style={styles.center}
            testID="loading-indicator"
          />
        )}

        {!loading && error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {!loading && !error && trails.length === 0 && (
          <Text style={styles.emptyText}>Nog geen gepubliceerde tochten.</Text>
        )}

        {!loading &&
          !error &&
          trails.map((trail) => (
            <Card key={trail.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {trail.city} · {trail.theme} · {trail.actual_distance_km.toFixed(1)} km ·{" "}
                {trail.stops.length} stops
              </Text>
              <AppButton
                title={loadingId === trail.id ? "Laden…" : "Speel"}
                onPress={() => {
                  void handlePlay(trail);
                }}
                disabled={loadingId !== null}
              />
            </Card>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingTop: spacing(6),
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(1),
  },
  logo: {
    fontSize: 24,
    fontWeight: "400",
    color: colors.terracotta,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    color: colors.navy,
    paddingHorizontal: spacing(2),
    marginBottom: spacing(2),
  },
  list: {
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(4),
    gap: spacing(1.5),
  },
  card: {
    gap: spacing(1),
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
  center: {
    marginTop: spacing(4),
  },
  errorText: {
    fontSize: 14,
    color: colors.terracotta,
    textAlign: "center",
    marginTop: spacing(4),
  },
  emptyText: {
    fontSize: 14,
    color: colors.navy,
    textAlign: "center",
    marginTop: spacing(4),
    opacity: 0.7,
  },
});
