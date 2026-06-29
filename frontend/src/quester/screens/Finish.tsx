import { useState } from "react";
import {
  Button,
  EyebrowLabel,
  PhoneFrame,
  StatTile,
} from "../../design-system/primitives";
import { deriveBadges } from "../gamification";
import { useQuester } from "../store";

const STAR_FILLED = "#c5912f";
const STAR_EMPTY_STROKE = "#d8c8a0";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? STAR_FILLED : "none"} stroke={filled ? STAR_FILLED : STAR_EMPTY_STROKE} strokeWidth="1.6">
      <path d="M12 2l2.9 6.3 6.8.7-5 4.6 1.4 6.7L12 17.8 5.9 20.6l1.4-6.7-5-4.6 6.8-.7z" />
    </svg>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}u` : `${h}u${m < 10 ? "0" : ""}${m}`;
}

export function Finish() {
  const { state, reset } = useQuester();
  const trail = state.trail!;
  const badges = deriveBadges(trail, Object.values(state.solves));
  const [rating, setRating] = useState(0);

  const distanceLabel = `${trail.actual_distance_km.toFixed(1).replace(".", ",")} km`;
  const durationLabel = formatDuration(trail.estimated_duration_min);
  const stopsLabel = `${trail.stops.length}/${trail.stops.length}`;

  // Bonus: count stops solved on first try
  const firstTrySolves = Object.values(state.solves).filter((s) => s.correct && s.attempt === 1).length;
  const bonusPoints = firstTrySolves * 30;

  return (
    <PhoneFrame>
      {/* Navy header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 210,
          background: "#283a5e",
          borderRadius: "0 0 28px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        {/* Decorative background shapes */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.18 }}>
          <svg viewBox="0 0 360 210" style={{ width: "100%", height: "100%" }}>
            <g stroke="#fff" strokeWidth="1" fill="none">
              <circle cx="60" cy="40" r="3" />
              <circle cx="300" cy="30" r="4" />
              <path d="M40 160 L46 150 L52 160 Z" />
              <circle cx="320" cy="160" r="3" />
              <path d="M280 90 l3 6 l-6 0 Z" />
              <circle cx="100" cy="180" r="2" />
            </g>
          </svg>
        </div>

        <div style={{ font: "600 11px/1 'Spline Sans Mono'", color: "#f0c0b8", letterSpacing: 2 }}>
          TOCHT VOLTOOID
        </div>
        <div style={{ font: "400 34px/1.05 'DM Serif Display'", marginTop: 8 }}>
          Goed gedaan!
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ font: "400 46px/1 'DM Serif Display'", color: "#fff" }}>
            {state.points}
          </span>
          <span style={{ font: "600 13px/1 'DM Sans'", color: "#aeb9d2" }}>punten</span>
        </div>
      </div>

      {/* Content panel */}
      <div
        style={{
          position: "absolute",
          top: 222,
          left: 0,
          right: 0,
          bottom: 0,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 15,
          overflowY: "auto",
        }}
      >
        {/* Bonus banner */}
        {bonusPoints > 0 && (
          <div
            style={{
              textAlign: "center",
              font: "500 12px/1.4 'DM Sans'",
              color: "#6f8a4f",
              background: "#e7eed7",
              borderRadius: 10,
              padding: 9,
            }}
          >
            +{bonusPoints} bonus · {firstTrySolves} {firstTrySolves === 1 ? "stop" : "stops"} in één poging opgelost
          </div>
        )}

        {/* Badges */}
        <div>
          <EyebrowLabel>Verdiende badges</EyebrowLabel>
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", marginTop: 11 }}>
            {badges.map((badge) => (
              <div key={badge.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    background: "#f1f3f8",
                    border: "2px dashed #9fb0d0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#283a5e",
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 12 15 7 12 17 9 7Z" fill="currentColor" />
                  </svg>
                </span>
                <span style={{ font: "600 11px/1.2 'DM Sans'", color: "#211f1b" }}>{badge.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 0,
            background: "#faf6ec",
            border: "1px solid #e0d5bf",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <StatTile value={distanceLabel} label="GELOPEN" />
          <div style={{ width: 1, background: "#ece2cf" }} />
          <StatTile value={durationLabel} label="DUUR" />
          <div style={{ width: 1, background: "#ece2cf" }} />
          <StatTile value={stopsLabel} label="STOPS" />
        </div>

        {/* Star rating */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#faf6ec",
            border: "1px solid #e0d5bf",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <span style={{ font: "600 13px/1 'DM Sans'", color: "#211f1b" }}>Hoe was het?</span>
          <span style={{ display: "flex", gap: 3 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                aria-label={`${star} ster`}
                onClick={() => setRating(star)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
              >
                <StarIcon filled={star <= rating} />
              </button>
            ))}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: "auto", display: "flex", gap: 9 }}>
          <Button
            variant="primary"
            style={{ flex: 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
            </svg>
            Delen
          </Button>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            onClick={reset}
          >
            Nieuwe tocht
          </Button>
        </div>
      </div>
    </PhoneFrame>
  );
}
