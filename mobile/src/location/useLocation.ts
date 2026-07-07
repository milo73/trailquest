import { useEffect, useState } from "react";
import * as Location from "expo-location";
import type { GeoPoint } from "../api/types";

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useLocation() {
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setGranted(status === "granted");
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced }, (loc) =>
        setPosition({ lat: loc.coords.latitude, lon: loc.coords.longitude }),
      );
    })();
    return () => sub?.remove();
  }, []);

  return { position, granted };
}
