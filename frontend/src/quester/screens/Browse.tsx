import { useEffect, useState } from "react";
import { getTrail, listTrails } from "../../api/trails";
import type { Trail } from "../../api/types";
import { Button, EyebrowLabel, PhoneFrame } from "../../design-system/primitives";
import { useQuester } from "../store";
import { formatKm } from "./Preview";

// ─── Browse screen ───────────────────────────────────────────────────────────

export function Browse() {
  const { setTrail, goToConfigure } = useQuester();
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

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
    setPlayingId(trail.id);
    try {
      const full = await getTrail(trail.id);
      setTrail(full);
    } catch {
      setPlayingId(null);
    }
  }

  return (
    <PhoneFrame>
      <div
        style={{
          padding: "8px 18px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 15,
          height: "100%",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "400 23px/1 'DM Serif Display'", color: "#b5453a" }}>TrailQuest</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#faf6ec",
              border: "1px solid #e0d5bf",
              borderRadius: 20,
              padding: "6px 11px",
              font: "600 12px/1 'DM Sans'",
              color: "#283a5e",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2.4">
              <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.3" />
            </svg>
            Haarlem
          </span>
        </div>

        {/* Title */}
        <div>
          <div
            style={{
              font: "600 11px/1 'Spline Sans Mono'",
              color: "#b5453a",
              letterSpacing: "1.5px",
            }}
          >
            KIES EEN TOCHT
          </div>
          <div
            style={{
              font: "400 31px/1.05 'DM Serif Display'",
              color: "#283a5e",
              marginTop: 7,
            }}
          >
            Kies een tocht
          </div>
        </div>

        {/* Trail list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          {loading && (
            <div style={{ font: "500 13px/1 'DM Sans'", color: "#8a7f6d", textAlign: "center", marginTop: 24 }}>
              Tochten laden…
            </div>
          )}

          {!loading && error && (
            <div style={{ font: "500 13px/1 'DM Sans'", color: "#b5453a", textAlign: "center", marginTop: 24 }}>
              {error}
            </div>
          )}

          {!loading && !error && trails.length === 0 && (
            <div style={{ font: "500 13px/1.4 'DM Sans'", color: "#8a7f6d", textAlign: "center", marginTop: 24 }}>
              Nog geen gepubliceerde tochten — genereer er zelf een.
            </div>
          )}

          {!loading && !error && trails.map((trail) => (
            <div
              key={trail.id}
              style={{
                background: "#faf6ec",
                border: "1px solid #e0d5bf",
                borderRadius: 13,
                padding: "13px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <EyebrowLabel>{trail.city} · {trail.theme}</EyebrowLabel>
              <div style={{ font: "600 14px/1.2 'DM Sans'", color: "#211f1b" }}>
                {trail.city} · {trail.theme} · {formatKm(trail.actual_distance_km)} km · {trail.stops.length} stops
              </div>
              <Button
                variant="primary"
                disabled={playingId !== null}
                onClick={() => { void handlePlay(trail); }}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 12,
                  fontSize: 14,
                  marginTop: 4,
                  boxShadow: "0 6px 14px -6px rgba(150,58,48,.65)",
                }}
              >
                {playingId === trail.id ? "Laden…" : "Speel"}
                {playingId !== trail.id && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Self-generate CTA */}
        <div style={{ marginTop: "auto" }}>
          <Button
            variant="secondary"
            onClick={goToConfigure}
            style={{
              width: "100%",
              height: 46,
              borderRadius: 13,
              fontSize: 14,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
              <line x1="4" y1="12" x2="19" y2="12" />
              <path d="M13 6 19 12 13 18" />
            </svg>
            Zelf genereren
          </Button>
        </div>
      </div>
    </PhoneFrame>
  );
}
