import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StudioChrome } from "../StudioChrome";
import { MapCanvas } from "../../design-system/primitives/MapCanvas";
import { Button } from "../../design-system/primitives/Button";
import { Chip } from "../../design-system/primitives/Chip";
import { useDraft } from "../draftStore";
import { PoiPicker } from "../components/PoiPicker";
import { CustomStopForm } from "../components/CustomStopForm";

function formatKm(km: number): string {
  return km.toFixed(1).replace(".", ",");
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}u`;
  return `${h}u${m}`;
}

export function RouteEditor() {
  const navigate = useNavigate();
  const { draft, addStop, removeStop, reorder, setActiveStop, createDraft, loadDraft, addCustomStop, renameDraft, saving } = useDraft();
  const [addMode, setAddMode] = useState<null | "menu" | "catalog" | "custom">(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  // Seed title from draft, re-seed when draft id changes
  useEffect(() => {
    if (draft) setTitle(draft.title);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: if no draft but localStorage has an id, load it
  useEffect(() => {
    if (!draft) {
      const savedId = localStorage.getItem("tq.studio.draft");
      if (savedId) {
        loadDraft(savedId);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty state when no draft and no saved id
  if (!draft) {
    return (
      <StudioChrome breadcrumb="route-editor">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 760,
            font: "400 15px/1.5 var(--tq-sans)",
            color: "#8a7f6d",
          }}
        >
          Nog geen tocht — maak er een via het dashboard of genereer een concept
        </div>
      </StudioChrome>
    );
  }

  const grounded = draft.stops.filter((s) => s.poi.facts.length > 0).length;
  const warnings = draft.stops.length - grounded;
  const actual = draft.actual_distance_km;
  const requested = draft.requested_distance_km;
  const withinTolerance = Math.abs(actual - requested) <= 0.15 * requested;

  const mapStops = [
    { order: 0, label: "S" },
    ...draft.stops.map((s) => ({ order: s.order, label: String(s.order) })),
  ];

  async function handleReorder(order: number, dir: "up" | "down") {
    setBusy(true);
    try {
      await reorder(order, dir);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveStop(order: number) {
    setBusy(true);
    try {
      await removeStop(order);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStop(poi: Parameters<typeof addStop>[0]) {
    setBusy(true);
    try {
      await addStop(poi);
    } finally {
      setBusy(false);
    }
    setAddMode(null);
  }

  async function handleAddCustomStop(body: Parameters<typeof addCustomStop>[0]) {
    setBusy(true);
    try {
      await addCustomStop(body);
    } finally {
      setBusy(false);
    }
    setAddMode(null);
  }

  async function handleGenereer() {
    if (creating) return;
    setCreating(true);
    try {
      await createDraft({
        start: draft?.start ?? { lat: 52.3812, lon: 4.6361 },
        distance_km: 5,
        theme: "historical",
        from_concept: true,
      });
    } finally {
      setCreating(false);
    }
  }

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
          <button
            onClick={() => navigate("/studio/validate")}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 10,
              border: "1px solid #cbbfa6",
              background: "#fff",
              font: "600 13px/1 var(--tq-sans)",
              color: "#283a5e",
              cursor: "pointer",
            }}
          >
            Publiceren
          </button>
          <Button
            variant="primary"
            style={{ height: 40, fontSize: 13, borderRadius: 10 }}
            onClick={handleGenereer}
            disabled={creating}
          >
            {creating ? "Genereren…" : "Genereer concept"}
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                aria-label="Tochtnaam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title !== draft.title) renameDraft(title.trim());
                }}
                style={{
                  flex: 1,
                  font: "400 24px/1.1 var(--tq-serif)",
                  color: "#283a5e",
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  padding: 0,
                  minWidth: 0,
                }}
              />
              <span
                style={{
                  font: "500 10px/1 var(--tq-mono)",
                  color: "#8a7f6d",
                  flexShrink: 0,
                }}
              >
                {saving ? "Bezig…" : "Opgeslagen ✓"}
              </span>
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
                  {formatKm(draft.actual_distance_km)}<span style={{ font: "600 11px var(--tq-sans)", color: "#8a7f6d" }}> km</span>
                </div>
                <div style={{ font: "500 10px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 4 }}>AFSTAND</div>
              </div>
              <div>
                <div style={{ font: "400 19px/1 var(--tq-serif)", color: "#211f1b" }}>~{formatDuration(draft.estimated_duration_min)}</div>
                <div style={{ font: "500 10px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 4 }}>DUUR</div>
              </div>
              <div>
                <div style={{ font: "400 19px/1 var(--tq-serif)", color: "#211f1b" }}>{draft.stops.length}</div>
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
              {/* Start row — non-removable */}
              <li
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 9,
                  cursor: "default",
                }}
              >
                {/* Drag handle icon */}
                <svg width="12" height="16" viewBox="0 0 12 16" fill="#cbbfa6">
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
                    background: "#283a5e",
                    border: "none",
                    color: "#fff",
                    font: "700 11px/24px var(--tq-sans)",
                    textAlign: "center",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                >
                  S
                </span>
                {/* Name */}
                <span
                  style={{
                    flex: 1,
                    font: "600 13px/1.2 var(--tq-sans)",
                    color: "#211f1b",
                  }}
                >
                  Startpunt<span style={{ fontWeight: 500, color: "#8a7f6d" }}> · start</span>
                </span>
                {/* Checkmark */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4" style={{ flexShrink: 0 }}>
                  <path d="M5 12l4 4 10-10" />
                </svg>
              </li>

              {/* Regular stop rows */}
              {draft.stops.map((stop, index) => {
                const hasWarning = stop.poi.facts.length === 0;
                return (
                  <li
                    key={stop.poi.id}
                    onClick={() => {
                      setActiveStop(stop.order);
                      navigate("/studio/stop");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 10px",
                      borderRadius: 9,
                      cursor: "pointer",
                      background: hasWarning ? "#fbeee6" : undefined,
                      border: hasWarning ? "1.5px solid #b5453a" : undefined,
                    }}
                  >
                    {/* Drag handle icon */}
                    <svg width="12" height="16" viewBox="0 0 12 16" fill={hasWarning ? "#d99" : "#cbbfa6"}>
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
                        background: hasWarning ? "#b5453a" : "#fff",
                        border: hasWarning ? "none" : "2px solid #b5453a",
                        color: hasWarning ? "#fff" : "#283a5e",
                        font: "700 11px/24px var(--tq-sans)",
                        textAlign: "center",
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    >
                      {stop.order}
                    </span>

                    {/* Name */}
                    <span
                      style={{
                        flex: 1,
                        font: hasWarning ? "700 13px/1.2 var(--tq-sans)" : "600 13px/1.2 var(--tq-sans)",
                        color: hasWarning ? "#963a30" : "#211f1b",
                      }}
                    >
                      {stop.poi.name}
                    </span>

                    {/* Warning badge */}
                    {hasWarning && (
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
                        geen feiten
                      </span>
                    )}

                    {/* Checkmark (non-warning stops) */}
                    {!hasWarning && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4" style={{ flexShrink: 0 }}>
                        <path d="M5 12l4 4 10-10" />
                      </svg>
                    )}

                    {/* Reorder + remove controls */}
                    <span
                      style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        aria-label={`${stop.poi.name} omhoog`}
                        onClick={(e) => { e.stopPropagation(); handleReorder(stop.order, "up"); }}
                        disabled={busy || index === 0}
                        style={{
                          width: 18,
                          height: 18,
                          border: "none",
                          background: "transparent",
                          cursor: (busy || index === 0) ? "default" : "pointer",
                          padding: 0,
                          fontSize: 10,
                          lineHeight: 1,
                          color: (busy || index === 0) ? "#cbbfa6" : "#8a7f6d",
                        }}
                      >
                        ▲
                      </button>
                      <button
                        aria-label={`${stop.poi.name} omlaag`}
                        onClick={(e) => { e.stopPropagation(); handleReorder(stop.order, "down"); }}
                        disabled={busy || index === draft.stops.length - 1}
                        style={{
                          width: 18,
                          height: 18,
                          border: "none",
                          background: "transparent",
                          cursor: (busy || index === draft.stops.length - 1) ? "default" : "pointer",
                          padding: 0,
                          fontSize: 10,
                          lineHeight: 1,
                          color: (busy || index === draft.stops.length - 1) ? "#cbbfa6" : "#8a7f6d",
                        }}
                      >
                        ▼
                      </button>
                    </span>

                    {/* Remove button */}
                    <button
                      aria-label={`${stop.poi.name} verwijderen`}
                      onClick={(e) => { e.stopPropagation(); handleRemoveStop(stop.order); }}
                      disabled={busy}
                      style={{
                        width: 18,
                        height: 18,
                        border: "none",
                        background: "transparent",
                        cursor: busy ? "default" : "pointer",
                        padding: 0,
                        fontSize: 13,
                        lineHeight: 1,
                        color: "#b5453a",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Add stop */}
          <div style={{ padding: "12px 18px 18px", position: "relative" }}>
            <button
              onClick={() => setAddMode("menu")}
              disabled={busy}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 10,
                border: "1.5px dashed #cbbfa6",
                background: "transparent",
                font: "600 13px/1 var(--tq-sans)",
                color: busy ? "#cbbfa6" : "#8a7f6d",
                cursor: busy ? "default" : "pointer",
              }}
            >
              + Stop toevoegen
            </button>
            {/* Add-mode chooser menu */}
            {addMode === "menu" && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% - 12px)",
                  left: 18,
                  right: 18,
                  background: "#faf6ec",
                  border: "1px solid #e0d5bf",
                  borderRadius: 10,
                  boxShadow: "0 8px 20px -12px rgba(33,31,27,.4)",
                  overflow: "hidden",
                  zIndex: 10,
                }}
              >
                <button
                  onClick={() => setAddMode("catalog")}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: "1px solid #e6dcc6",
                    background: "transparent",
                    font: "600 13px/1 var(--tq-sans)",
                    color: "#283a5e",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Kies uit de buurt
                </button>
                <button
                  onClick={() => setAddMode("custom")}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    background: "transparent",
                    font: "600 13px/1 var(--tq-sans)",
                    color: "#283a5e",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Maak een nieuwe stop
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center map area */}
        <div style={{ flex: 1, position: "relative", background: "#ece4d3", overflow: "hidden" }}>
          <MapCanvas stops={mapStops} />

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
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#283a5e" }}>Validatie: {grounded} ok</span>
            {warnings > 0 && (
              <>
                <span style={{ color: "#cbbfa6" }}>·</span>
                <Chip tone="gold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5912f" strokeWidth="2.2">
                    <path d="M12 3 22 20H2Z" />
                    <line x1="12" y1="10" x2="12" y2="14.5" />
                  </svg>
                  {warnings} waarschuwing
                </Chip>
              </>
            )}
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
              <span style={{ font: "400 30px/1 var(--tq-serif)", color: "#283a5e" }}>{formatKm(draft.actual_distance_km)} km</span>
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
              <span>doel {formatKm(draft.requested_distance_km)} km</span>
              <span style={{ color: withinTolerance ? "#6f8a4f" : "#c5912f", fontWeight: 600 }}>
                {withinTolerance ? "binnen tolerantie ±15%" : "buiten tolerantie"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PoiPicker modal */}
      {addMode === "catalog" && (
        <PoiPicker
          start={draft.start}
          excludeIds={draft.stops.map((s) => s.poi.id)}
          onPick={handleAddStop}
          onClose={() => setAddMode(null)}
        />
      )}

      {/* CustomStopForm modal */}
      {addMode === "custom" && (
        <CustomStopForm
          start={draft.start}
          onSubmit={(body) => { handleAddCustomStop(body); }}
          onClose={() => setAddMode(null)}
        />
      )}
    </StudioChrome>
  );
}
