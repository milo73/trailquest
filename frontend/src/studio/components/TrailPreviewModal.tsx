import { TileMap } from "../../design-system/primitives/TileMap";
import type { DraftTrail } from "../../api/types";

interface Props {
  draft: DraftTrail;
  onClose: () => void;
}

export function TrailPreviewModal({ draft, onClose }: Props) {
  const mapStops = [
    { order: 0, label: "S", lat: draft.start.lat, lon: draft.start.lon },
    ...draft.stops.map((s) => ({
      order: s.order,
      label: String(s.order),
      lat: s.poi.location.lat,
      lon: s.poi.location.lon,
    })),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(33, 31, 27, 0.55)",
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Voorvertoning"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)",
          background: "var(--tq-paper)",
          border: "1px solid var(--tq-border)",
          borderRadius: 16,
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
            flexShrink: 0,
          }}
        >
          <span style={{ font: "600 15px/1 var(--tq-sans)", color: "var(--tq-navy)" }}>
            Zo ziet de speler het
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

        {/* Phone-like frame with map */}
        <div
          style={{
            height: 260,
            flexShrink: 0,
            borderBottom: "1px solid var(--tq-border)",
            background: "#ece4d3",
            overflow: "hidden",
          }}
        >
          <TileMap stops={mapStops} routeGeometry={draft.route_geometry} />
        </div>

        {/* Scrollable stop list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {draft.stops.map((stop) => {
            const story = stop.story ?? null;
            const excerpt = story
              ? story.slice(0, 150) + (story.length > 150 ? "…" : "")
              : "—";
            const primaryQuestion =
              stop.primary_question_index != null &&
              stop.questions[stop.primary_question_index]
                ? stop.questions[stop.primary_question_index]
                : null;

            return (
              <div key={stop.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Stop title */}
                <div
                  style={{
                    font: "600 14px/1.2 var(--tq-sans)",
                    color: "var(--tq-navy)",
                  }}
                >
                  {stop.order}. {stop.poi.name}
                </div>

                {/* Story excerpt */}
                <div
                  style={{
                    font: "400 13px/1.5 var(--tq-sans)",
                    color: story ? "var(--tq-ink)" : "var(--tq-muted)",
                  }}
                >
                  {excerpt}
                </div>

                {/* Primary question */}
                {primaryQuestion && (
                  <div
                    style={{
                      font: "500 12px/1.4 var(--tq-sans)",
                      color: "#283a5e",
                      background: "#f0ece3",
                      border: "1px solid var(--tq-border)",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    {primaryQuestion.prompt}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
