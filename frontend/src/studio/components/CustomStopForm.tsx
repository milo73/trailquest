import { useState } from "react";

interface CustomStopBody {
  name?: string;
  lat?: number;
  lon?: number;
  source_ref?: string;
}

interface Props {
  start: { lat: number; lon: number };
  onSubmit: (body: CustomStopBody) => void;
  onClose: () => void;
}

export function CustomStopForm({ start, onSubmit, onClose }: Props) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [sourceRef, setSourceRef] = useState("");

  const canSubmit = name.trim() !== "" || sourceRef.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const body: CustomStopBody = {};
    if (name.trim()) body.name = name.trim();
    if (sourceRef.trim()) body.source_ref = sourceRef.trim();
    if (!isNaN(parsedLat)) body.lat = parsedLat;
    if (!isNaN(parsedLon)) body.lon = parsedLon;
    onSubmit(body);
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
        aria-label="Nieuwe stop"
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
            Nieuwe stop
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
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="custom-stop-name"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Naam
            </label>
            <input
              id="custom-stop-name"
              aria-label="Naam"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label
              htmlFor="custom-stop-source"
              style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
            >
              Wikipedia/Wikidata-link of QID
            </label>
            <input
              id="custom-stop-source"
              aria-label="Wikipedia/Wikidata-link of QID"
              type="text"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder="https://nl.wikipedia.org/wiki/… of Q42"
              style={{ height: 38, padding: "0 10px", border: "1px solid var(--tq-border)", borderRadius: 8, font: "400 14px/1 var(--tq-sans)", color: "var(--tq-ink)", background: "var(--tq-sand)", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <label
                htmlFor="custom-stop-lat"
                style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
              >
                Latitude
              </label>
              <input
                id="custom-stop-lat"
                aria-label="Latitude"
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder={String(start.lat)}
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
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <label
                htmlFor="custom-stop-lon"
                style={{ font: "600 12px/1 var(--tq-sans)", color: "var(--tq-navy)" }}
              >
                Longitude
              </label>
              <input
                id="custom-stop-lon"
                aria-label="Longitude"
                type="text"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder={String(start.lon)}
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
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              height: 42,
              borderRadius: 10,
              border: "none",
              background: canSubmit ? "#283a5e" : "#cbbfa6",
              font: "600 14px/1 var(--tq-sans)",
              color: "#fff",
              cursor: canSubmit ? "pointer" : "default",
              marginTop: 4,
            }}
          >
            Toevoegen
          </button>
        </form>
      </div>
    </>
  );
}
