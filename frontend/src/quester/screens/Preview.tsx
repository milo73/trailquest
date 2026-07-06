import { useState } from "react";
import { createTrail } from "../../api/trails";
import type { Theme } from "../../api/types";
import {
  Button,
  Chip,
  EyebrowLabel,
  TileMap,
  PhoneFrame,
  StatTile,
} from "../../design-system/primitives";
import { useQuester } from "../store";

// ─── helpers ────────────────────────────────────────────────────────────────

const THEME_TITLES: Record<Theme, string> = {
  historical: "Langs de Gouden Eeuw",
  hidden_gems: "Langs Verborgen Schatten",
  family: "Een Avontuur voor het Gezin",
  architecture: "De Stad als Bouwwerk",
  nature: "Langs Groen en Blauw",
  mixed: "De Bonte Speurtocht",
};

const THEME_LABELS: Record<Theme, string> = {
  historical: "Historisch",
  hidden_gems: "Verborgen parels",
  family: "Familie",
  architecture: "Architectuur",
  nature: "Natuur",
  mixed: "Gemengd",
};

export function formatKm(km: number): string {
  return km.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(".", ",");
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u${String(m).padStart(2, "0")}`;
}

// ─── Preview screen ─────────────────────────────────────────────────────────

export function Preview() {
  const { state, goToStop, setTrail } = useQuester();
  const [regenerating, setRegenerating] = useState(false);
  const trail = state.trail!;

  const firstStop = trail.stops[0];
  const secondStop = trail.stops[1];
  const surpriseCount = trail.stops.length - 2;

  const mapStops = [
    { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
    ...trail.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
  ];

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const newTrail = await createTrail(state.config);
      setTrail(newTrail);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <PhoneFrame>
      {/* Map header */}
      <div style={{ position: "relative", height: 270 }}>
        <TileMap stops={mapStops} routeGeometry={trail.route_geometry} />
        {/* status bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            font: "600 13px/1 'DM Sans'",
          }}
        >
          <span>9:41</span>
          <svg width="24" height="12" viewBox="0 0 24 12">
            <rect x="0.5" y="1" width="20" height="10" rx="3" fill="none" stroke="#211f1b" strokeOpacity=".5" />
            <rect x="2.5" y="3" width="14" height="6" rx="1.5" fill="#211f1b" />
            <rect x="21.5" y="4" width="2" height="4" rx="1" fill="#211f1b" />
          </svg>
        </div>
        {/* back button */}
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 16,
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "rgba(250,246,236,.92)",
            border: "1px solid #e0d5bf",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2.2">
            <path d="M15 6 9 12 15 18" />
          </svg>
        </div>
      </div>

      {/* Content panel */}
      <div
        style={{
          position: "absolute",
          top: 270,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#f3ede0",
          borderRadius: "24px 24px 0 0",
          marginTop: -22,
          padding: "20px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* Title block */}
        <div>
          <EyebrowLabel color="#b5453a">JE SPEURTOCHT IS KLAAR</EyebrowLabel>
          <div
            style={{
              font: "400 28px/1.05 'DM Serif Display'",
              color: "#283a5e",
              marginTop: 7,
            }}
          >
            {THEME_TITLES[trail.theme]}
          </div>
          <div style={{ marginTop: 11 }}>
            <Chip tone="terracotta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 9 12 4 20 9" />
                <line x1="5" y1="20" x2="19" y2="20" />
                <line x1="9" y1="9.5" x2="9" y2="19" />
                <line x1="15" y1="9.5" x2="15" y2="19" />
              </svg>
              {THEME_LABELS[trail.theme]} · {trail.city}
            </Chip>
          </div>
        </div>

        {/* Stat tiles */}
        <div
          style={{
            display: "flex",
            gap: 0,
            background: "#faf6ec",
            border: "1px solid #e0d5bf",
            borderRadius: 13,
            overflow: "hidden",
          }}
        >
          <StatTile value={formatKm(trail.actual_distance_km)} label="KM" />
          <div style={{ borderLeft: "1px solid #ece2cf" }}>
            <StatTile value={formatDuration(trail.estimated_duration_min)} label="DUUR" />
          </div>
          <div style={{ borderLeft: "1px solid #ece2cf" }}>
            <StatTile value={trail.stops.length} label="STOPS" />
          </div>
        </div>

        {/* Wat je gaat ontdekken */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <EyebrowLabel>Wat je gaat ontdekken</EyebrowLabel>

          {/* First stop */}
          {firstStop && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                background: "#faf6ec",
                border: "1px solid #e0d5bf",
                borderRadius: 11,
                padding: "11px 13px",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#283a5e",
                  color: "#fff",
                  font: "700 11px/22px 'DM Sans'",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span style={{ flex: 1, font: "600 13px/1 'DM Sans'", color: "#211f1b" }}>
                {firstStop.poi.name}
              </span>
              <span style={{ font: "500 11px/1 'DM Sans'", color: "#8a7f6d" }}>start</span>
            </div>
          )}

          {/* Second stop */}
          {secondStop && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                background: "#faf6ec",
                border: "1px solid #e0d5bf",
                borderRadius: 11,
                padding: "11px 13px",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "2px solid #b5453a",
                  color: "#283a5e",
                  font: "700 11px/18px 'DM Sans'",
                  textAlign: "center",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                2
              </span>
              <span style={{ flex: 1, font: "600 13px/1 'DM Sans'", color: "#211f1b" }}>
                {secondStop.poi.name}
              </span>
            </div>
          )}

          {/* Surprise row */}
          {surpriseCount > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                border: "1px dashed #cbbfa6",
                borderRadius: 11,
                padding: "11px 13px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2">
                <path d="M6 9 12 3 18 9 12 21Z" />
                <line x1="6" y1="9" x2="18" y2="9" />
              </svg>
              <span style={{ flex: 1, font: "600 13px/1 'DM Sans'", color: "#8a7f6d" }}>
                + {surpriseCount} verrassingen onderweg
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
          <Button
            variant="primary"
            onClick={() => goToStop(firstStop.order)}
            style={{
              width: "100%",
              height: 54,
              borderRadius: 15,
              fontSize: 16,
              boxShadow: "0 10px 22px -10px rgba(150,58,48,.75)",
            }}
          >
            Start speurtocht
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            disabled={regenerating}
            onClick={handleRegenerate}
            style={{
              width: "100%",
              height: 46,
              borderRadius: 13,
              fontSize: 14,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
            </svg>
            Opnieuw genereren
          </Button>
        </div>
      </div>
    </PhoneFrame>
  );
}
