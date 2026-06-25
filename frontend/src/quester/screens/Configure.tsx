import { useState } from "react";
import { ApiError } from "../../api/client";
import { createTrail } from "../../api/trails";
import type { Theme } from "../../api/types";
import {
  Button,
  EyebrowLabel,
  PhoneFrame,
  SegmentedControl,
} from "../../design-system/primitives";
import { useQuester } from "../store";

type LocationMode = "GPS" | "Zoeken" | "Kaart";

const LOCATION_OPTIONS: { value: LocationMode; label: string }[] = [
  { value: "GPS", label: "GPS" },
  { value: "Zoeken", label: "Zoeken" },
  { value: "Kaart", label: "Kaart" },
];

const DISTANCE_OPTIONS = [2, 5, 10, 15] as const;

interface ThemeCard {
  value: Theme;
  label: string;
  icon: React.ReactNode;
}

const THEME_CARDS: ThemeCard[] = [
  {
    value: "historical",
    label: "Historisch",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 9 12 4 20 9" />
        <line x1="5" y1="20" x2="19" y2="20" />
        <line x1="7" y1="9.5" x2="7" y2="19" />
        <line x1="12" y1="9.5" x2="12" y2="19" />
        <line x1="17" y1="9.5" x2="17" y2="19" />
      </svg>
    ),
  },
  {
    value: "hidden_gems",
    label: "Verborgen parels",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M6 9 12 3 18 9 12 21Z" />
        <line x1="6" y1="9" x2="18" y2="9" />
      </svg>
    ),
  },
  {
    value: "family",
    label: "Familie",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="9" cy="9" r="3" />
        <circle cx="16" cy="10" r="2.4" />
        <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      </svg>
    ),
  },
  {
    value: "architecture",
    label: "Architectuur",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 20 9 6 14 20" />
        <rect x="14" y="11" width="6" height="9" />
      </svg>
    ),
  },
  {
    value: "nature",
    label: "Natuur",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 19 9 8 13 14 16 9 21 19Z" />
      </svg>
    ),
  },
  {
    value: "mixed",
    label: "Gemengd",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8" cy="8" r="2" />
        <circle cx="16" cy="8" r="2" />
        <circle cx="8" cy="16" r="2" />
        <circle cx="16" cy="16" r="2" />
      </svg>
    ),
  },
];

export function Configure() {
  const { state, setConfig, setTrail } = useQuester();
  const [locationMode, setLocationMode] = useState<LocationMode>("GPS");
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleLocationChange(mode: LocationMode) {
    setLocationMode(mode);
    if (mode === "GPS") {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setConfig({ start: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
        },
        () => {
          // keep default, show "Grote Markt 2 · Huidige locatie"
        },
      );
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrorMsg(null);
    try {
      const trail = await createTrail(state.config);
      setTrail(trail);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Er is iets misgegaan.");
      }
    } finally {
      setGenerating(false);
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
            SPEURTOCHT OP MAAT
          </div>
          <div
            style={{
              font: "400 31px/1.05 'DM Serif Display'",
              color: "#283a5e",
              marginTop: 7,
            }}
          >
            Waar begin je?
          </div>
        </div>

        {/* Start location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <EyebrowLabel>Startlocatie</EyebrowLabel>
          <SegmentedControl
            options={LOCATION_OPTIONS}
            value={locationMode}
            onChange={handleLocationChange}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              background: "#faf6ec",
              border: "1px solid #e0d5bf",
              borderRadius: 12,
              padding: "12px 13px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2">
              <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ font: "600 14px/1.2 'DM Sans'", color: "#211f1b" }}>Grote Markt 2</div>
              <div style={{ font: "500 11px/1 'DM Sans'", color: "#8a7f6d", marginTop: 3 }}>
                Huidige locatie · GPS-fix ±6 m
              </div>
            </div>
          </div>
        </div>

        {/* Distance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <EyebrowLabel>Afstand</EyebrowLabel>
          <div style={{ display: "flex", gap: 7 }}>
            {DISTANCE_OPTIONS.map((km) => {
              const active = state.config.distance_km === km;
              return (
                <button
                  key={km}
                  onClick={() => setConfig({ distance_km: km })}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "10px 0",
                    borderRadius: 10,
                    border: active ? "none" : "1px solid #e0d5bf",
                    background: active ? "#b5453a" : "#faf6ec",
                    color: active ? "#fff" : "#6b6256",
                    font: active ? "700 13px/1 'DM Sans'" : "600 13px/1 'DM Sans'",
                    boxShadow: active ? "0 2px 6px -2px rgba(150,58,48,.6)" : "none",
                    cursor: "pointer",
                  }}
                >
                  {km}
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <EyebrowLabel>Thema</EyebrowLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {THEME_CARDS.map((card) => {
              const active = state.config.theme === card.value;
              return (
                <button
                  key={card.value}
                  onClick={() => setConfig({ theme: card.value })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "13px 4px",
                    borderRadius: 12,
                    background: active ? "#fbeee6" : "#faf6ec",
                    border: active ? "1.5px solid #b5453a" : "1px solid #e0d5bf",
                    color: active ? "#963a30" : "#6b6256",
                    cursor: "pointer",
                  }}
                >
                  {card.icon}
                  <span style={{ font: "600 11px/1.1 'DM Sans'", textAlign: "center" }}>
                    {card.label === "Verborgen parels" ? (
                      <>
                        Verborgen<br />parels
                      </>
                    ) : (
                      card.label
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate button */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <Button
            variant="primary"
            disabled={generating}
            onClick={handleGenerate}
            style={{ width: "100%", height: 54, borderRadius: 15, fontSize: 16, boxShadow: "0 10px 22px -10px rgba(150,58,48,.75)" }}
          >
            Genereer speurtocht
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <line x1="4" y1="12" x2="19" y2="12" />
              <path d="M13 6 19 12 13 18" />
            </svg>
          </Button>
          <div style={{ textAlign: "center", font: "500 11px/1 'Spline Sans Mono'", color: "#8a7f6d" }}>
            {errorMsg ?? "± 5 km  ·  ~1 u 45  ·  6 stops"}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
