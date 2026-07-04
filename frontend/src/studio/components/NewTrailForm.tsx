import { useState } from "react";
import type { DraftCreate, Theme } from "../../api/types";

interface Props {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (req: DraftCreate) => Promise<void>;
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "historical", label: "Historisch" },
  { value: "hidden_gems", label: "Verborgen parels" },
  { value: "family", label: "Familie" },
  { value: "architecture", label: "Architectuur" },
  { value: "nature", label: "Natuur" },
  { value: "mixed", label: "Gemengd" },
];

export function NewTrailForm({ submitting, onClose, onSubmit }: Props) {
  const [place, setPlace] = useState("");
  const [distanceKm, setDistanceKm] = useState("5");
  const [theme, setTheme] = useState<Theme>("mixed");
  const [desiredStops, setDesiredStops] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = place.trim() !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const req: DraftCreate = {
      place: place.trim(),
      distance_km: Number(distanceKm) || 5,
      theme,
      from_concept: true,
      ...(desiredStops.trim() ? { desired_stops: Number(desiredStops) } : {}),
    };
    setError(null);
    try {
      await onSubmit(req);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Genereren mislukt");
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(33, 31, 27, 0.45)",
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Nieuwe tocht"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--tq-paper)",
          border: "1px solid var(--tq-border)",
          borderRadius: 14,
          boxShadow: "var(--tq-shadow-card)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--tq-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ font: "600 15px/1 var(--tq-sans)", color: "var(--tq-navy)" }}>
            Nieuwe tocht
          </span>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "600 13px/1 var(--tq-sans)",
              color: "var(--tq-muted)",
              padding: "4px 8px",
            }}
          >
            Sluiten
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}
        >
          {/* Plaats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="new-trail-place"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Plaats
            </label>
            <input
              id="new-trail-place"
              aria-label="Plaats"
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="bijv. Haarlem"
              required
              style={{
                height: 38,
                padding: "0 10px",
                border: "1px solid var(--tq-border)",
                borderRadius: 8,
                font: "400 14px/1 var(--tq-sans)",
                color: "var(--tq-ink)",
                background: "var(--tq-sand)",
                outline: "none",
              }}
            />
          </div>

          {/* Afstand */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="new-trail-distance"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Afstand (km)
            </label>
            <input
              id="new-trail-distance"
              aria-label="Afstand"
              type="number"
              min={1}
              max={25}
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              style={{
                height: 38,
                padding: "0 10px",
                border: "1px solid var(--tq-border)",
                borderRadius: 8,
                font: "400 14px/1 var(--tq-sans)",
                color: "var(--tq-ink)",
                background: "var(--tq-sand)",
                outline: "none",
              }}
            />
          </div>

          {/* Thema */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="new-trail-theme"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Thema
            </label>
            <select
              id="new-trail-theme"
              aria-label="Thema"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              style={{
                height: 38,
                padding: "0 10px",
                border: "1px solid var(--tq-border)",
                borderRadius: 8,
                font: "400 14px/1 var(--tq-sans)",
                color: "var(--tq-ink)",
                background: "var(--tq-sand)",
                outline: "none",
              }}
            >
              {THEME_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Aantal stops */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="new-trail-stops"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Aantal stops (optioneel)
            </label>
            <input
              id="new-trail-stops"
              aria-label="Aantal stops"
              type="number"
              min={2}
              max={15}
              value={desiredStops}
              onChange={(e) => setDesiredStops(e.target.value)}
              placeholder="auto"
              style={{
                height: 38,
                padding: "0 10px",
                border: "1px solid var(--tq-border)",
                borderRadius: 8,
                font: "400 14px/1 var(--tq-sans)",
                color: "var(--tq-ink)",
                background: "var(--tq-sand)",
                outline: "none",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                font: "400 13px/1.4 var(--tq-sans)",
                color: "#b83232",
                background: "#fff0f0",
                border: "1px solid #f5c5c5",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              height: 42,
              borderRadius: 10,
              border: "none",
              background: canSubmit ? "var(--tq-navy)" : "var(--tq-sand)",
              font: "600 14px/1 var(--tq-sans)",
              color: "#fff",
              cursor: canSubmit ? "pointer" : "default",
              marginTop: 4,
            }}
          >
            {submitting ? "Bezig met genereren… dit kan even duren" : "Genereer concept"}
          </button>
        </form>
      </div>
    </>
  );
}
