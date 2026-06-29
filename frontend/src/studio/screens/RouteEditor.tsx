import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StudioChrome } from "../StudioChrome";
import { MapCanvas } from "../../design-system/primitives/MapCanvas";
import { Button } from "../../design-system/primitives/Button";
import { Chip } from "../../design-system/primitives/Chip";
import { createTrail } from "../../api/trails";

type RouteStop = {
  id: string;
  name: string;
  isStart?: boolean;
  warning?: string;
};

export const MOCK_ROUTE_STOPS: RouteStop[] = [
  { id: "1", name: "Grote Markt", isStart: true },
  { id: "2", name: "Stadhuis" },
  { id: "3", name: "Vleeshal" },
  { id: "4", name: "Sint-Bavokerk" },
  { id: "5", name: "Hofje van Bakenes" },
  { id: "6", name: "Molen De Adriaan", warning: "geen feiten" },
];

export function RouteEditor() {
  const navigate = useNavigate();
  const [stops, setStops] = useState<RouteStop[]>(MOCK_ROUTE_STOPS);
  const [activeOrder, setActiveOrder] = useState<number | undefined>(undefined);
  const [generating, setGenerating] = useState(false);

  function moveUp(index: number) {
    if (index <= 0) return;
    setStops((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    if (index >= stops.length - 1) return;
    setStops((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function addStop() {
    const id = `new-${Date.now()}`;
    setStops((prev) => [...prev, { id, name: "Nieuwe stop" }]);
  }

  async function handleGenereer() {
    setGenerating(true);
    try {
      const trail = await createTrail({
        start: { lat: 52.3812, lon: 4.6361 },
        distance_km: 5,
        theme: "historical",
      });
      const newStops: RouteStop[] = trail.stops.map((s, i) => ({
        id: s.poi.id,
        name: s.poi.name,
        isStart: i === 0,
      }));
      setStops(newStops);
    } catch {
      // leave list unchanged on error
    } finally {
      setGenerating(false);
    }
  }

  const mapStops = stops.map((s, i) => ({
    order: i,
    label: s.isStart ? "S" : String(i + 1),
  }));

  return (
    <StudioChrome
      breadcrumb="route-editor"
      actions={
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 10,
              border: "1px solid #e0d5bf",
              background: "#faf6ec",
              font: "600 13px/1 var(--tq-sans)",
              color: "#283a5e",
              cursor: "pointer",
            }}
          >
            Voorvertoning
          </button>
          <Button
            variant="primary"
            style={{ height: 40, fontSize: 13, borderRadius: 10 }}
            onClick={handleGenereer}
            disabled={generating}
          >
            {generating ? "Genereren…" : "Genereer concept"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", height: 760 }}>
        {/* Left stop-list sidebar */}
        <div
          style={{
            width: 336,
            flexShrink: 0,
            background: "#faf6ec",
            borderRight: "1px solid #e6dcc6",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e6dcc6" }}>
            <div style={{ font: "400 24px/1.1 var(--tq-serif)", color: "#283a5e" }}>
              Haarlems Gouden Eeuw
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 11,
                background: "#fbeee6",
                border: "1px solid #e8c3bb",
                borderRadius: 7,
                padding: "5px 9px",
                font: "600 11px/1 var(--tq-sans)",
                color: "#963a30",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 9 12 4 20 9" />
                <line x1="5" y1="20" x2="19" y2="20" />
                <line x1="9" y1="9.5" x2="9" y2="19" />
                <line x1="15" y1="9.5" x2="15" y2="19" />
              </svg>
              Historisch
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
              <div>
                <div style={{ font: "400 19px/1 var(--tq-serif)", color: "#211f1b" }}>
                  5,2<span style={{ font: "600 11px var(--tq-sans)", color: "#8a7f6d" }}> km</span>
                </div>
                <div style={{ font: "500 10px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 4 }}>AFSTAND</div>
              </div>
              <div>
                <div style={{ font: "400 19px/1 var(--tq-serif)", color: "#211f1b" }}>~1u50</div>
                <div style={{ font: "500 10px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 4 }}>DUUR</div>
              </div>
              <div>
                <div style={{ font: "400 19px/1 var(--tq-serif)", color: "#211f1b" }}>{stops.length}</div>
                <div style={{ font: "500 10px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 4 }}>STOPS</div>
              </div>
            </div>
          </div>

          {/* Section label */}
          <div
            style={{
              padding: "15px 20px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ font: "600 11px/1 var(--tq-mono)", color: "#8a7f6d", letterSpacing: 1 }}>
              STOPS · LOOPROUTE
            </span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a7f6d" strokeWidth="2">
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          </div>

          {/* Stop list */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "0 14px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <ul role="list" aria-label="Stops" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
              {stops.map((stop, index) => (
                <li
                  key={stop.id}
                  onClick={() => {
                    setActiveOrder(index);
                    navigate("/studio/stop");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 9,
                    cursor: "pointer",
                    background: stop.warning ? "#fbeee6" : undefined,
                    border: stop.warning ? "1.5px solid #b5453a" : undefined,
                  }}
                >
                  {/* Drag handle icon */}
                  <svg width="12" height="16" viewBox="0 0 12 16" fill={stop.warning ? "#d99" : "#cbbfa6"}>
                    <circle cx="3" cy="3" r="1.4" />
                    <circle cx="9" cy="3" r="1.4" />
                    <circle cx="3" cy="8" r="1.4" />
                    <circle cx="9" cy="8" r="1.4" />
                    <circle cx="3" cy="13" r="1.4" />
                    <circle cx="9" cy="13" r="1.4" />
                  </svg>

                  {/* Order badge */}
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: stop.isStart ? "#283a5e" : stop.warning ? "#b5453a" : "#fff",
                      border: stop.isStart || stop.warning ? "none" : "2px solid #b5453a",
                      color: stop.isStart || stop.warning ? "#fff" : "#283a5e",
                      font: "700 11px/24px var(--tq-sans)",
                      textAlign: "center",
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  >
                    {stop.isStart ? "S" : index + 1}
                  </span>

                  {/* Name */}
                  <span
                    style={{
                      flex: 1,
                      font: stop.warning ? "700 13px/1.2 var(--tq-sans)" : "600 13px/1.2 var(--tq-sans)",
                      color: stop.warning ? "#963a30" : stop.isStart ? "#211f1b" : "#211f1b",
                    }}
                  >
                    {stop.name}
                    {stop.isStart && (
                      <span style={{ fontWeight: 500, color: "#8a7f6d" }}> · start</span>
                    )}
                  </span>

                  {/* Warning badge */}
                  {stop.warning && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        font: "600 10px/1 var(--tq-sans)",
                        color: "#a3781f",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c5912f" strokeWidth="2">
                        <path d="M12 3 22 20H2Z" />
                        <line x1="12" y1="10" x2="12" y2="14.5" />
                      </svg>
                      {stop.warning}
                    </span>
                  )}

                  {/* Checkmark (non-warning stops) */}
                  {!stop.warning && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4" style={{ flexShrink: 0 }}>
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  )}

                  {/* Reorder + remove controls (non-start rows) */}
                  {!stop.isStart && (
                    <span
                      style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        aria-label={`${stop.name} omhoog`}
                        onClick={(e) => { e.stopPropagation(); moveUp(index); }}
                        disabled={index === 0}
                        style={{
                          width: 18,
                          height: 18,
                          border: "none",
                          background: "transparent",
                          cursor: index === 0 ? "default" : "pointer",
                          padding: 0,
                          fontSize: 10,
                          lineHeight: 1,
                          color: index === 0 ? "#cbbfa6" : "#8a7f6d",
                        }}
                      >
                        ▲
                      </button>
                      <button
                        aria-label={`${stop.name} omlaag`}
                        onClick={(e) => { e.stopPropagation(); moveDown(index); }}
                        disabled={index === stops.length - 1}
                        style={{
                          width: 18,
                          height: 18,
                          border: "none",
                          background: "transparent",
                          cursor: index === stops.length - 1 ? "default" : "pointer",
                          padding: 0,
                          fontSize: 10,
                          lineHeight: 1,
                          color: index === stops.length - 1 ? "#cbbfa6" : "#8a7f6d",
                        }}
                      >
                        ▼
                      </button>
                    </span>
                  )}

                  {/* Remove button (non-start rows) */}
                  {!stop.isStart && (
                    <button
                      aria-label={`${stop.name} verwijderen`}
                      onClick={(e) => { e.stopPropagation(); removeStop(index); }}
                      style={{
                        width: 18,
                        height: 18,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 13,
                        lineHeight: 1,
                        color: "#b5453a",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Add stop */}
          <div style={{ padding: "12px 18px 18px" }}>
            <button
              onClick={addStop}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 10,
                border: "1.5px dashed #cbbfa6",
                background: "transparent",
                font: "600 13px/1 var(--tq-sans)",
                color: "#8a7f6d",
                cursor: "pointer",
              }}
            >
              + Stop toevoegen
            </button>
          </div>
        </div>

        {/* Center map area */}
        <div style={{ flex: 1, position: "relative", background: "#ece4d3", overflow: "hidden" }}>
          <MapCanvas stops={mapStops} activeOrder={activeOrder} />

          {/* Toolbar */}
          <div
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: "#faf6ec",
              border: "1px solid #e0d5bf",
              borderRadius: 11,
              padding: 6,
              boxShadow: "0 8px 20px -12px rgba(33,31,27,.4)",
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#283a5e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8c0 4 2.5 6 6 6s6-2 6-6v-2a2 2 0 0 0-4 0" />
              </svg>
            </span>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#fff",
                border: "1px solid #e0d5bf",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#fff",
                border: "1px solid #e0d5bf",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
              </svg>
            </span>
          </div>

          {/* Validation chip (top right) */}
          <div
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "#faf6ec",
              border: "1px solid #e0d5bf",
              borderRadius: 11,
              padding: "9px 13px",
              boxShadow: "0 8px 20px -12px rgba(33,31,27,.4)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#283a5e" }}>Validatie: 3 ok</span>
            <span style={{ color: "#cbbfa6" }}>·</span>
            <Chip tone="gold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5912f" strokeWidth="2.2">
                <path d="M12 3 22 20H2Z" />
                <line x1="12" y1="10" x2="12" y2="14.5" />
              </svg>
              1 waarschuwing
            </Chip>
          </div>

          {/* Distance meter (bottom left) */}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 18,
              background: "#faf6ec",
              border: "1px solid #e0d5bf",
              borderRadius: 13,
              padding: "14px 18px",
              boxShadow: "0 8px 20px -12px rgba(33,31,27,.4)",
              minWidth: 230,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "400 30px/1 var(--tq-serif)", color: "#283a5e" }}>5,2 km</span>
              <span style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d" }}>looproute</span>
            </div>
            <div
              style={{
                marginTop: 11,
                height: 7,
                borderRadius: 4,
                background: "#e6dcc6",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "42.5%",
                  width: "15%",
                  top: 0,
                  bottom: 0,
                  background: "#9fb87f",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "42.5%",
                  top: -3,
                  bottom: -3,
                  width: 2,
                  background: "#283a5e",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 7,
                font: "500 10px/1 var(--tq-mono)",
                color: "#8a7f6d",
              }}
            >
              <span>doel 5 km</span>
              <span style={{ color: "#6f8a4f", fontWeight: 600 }}>binnen tolerantie ±15%</span>
            </div>
          </div>
        </div>
      </div>
    </StudioChrome>
  );
}
