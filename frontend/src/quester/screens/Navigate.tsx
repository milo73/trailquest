import { Button, EyebrowLabel, TileMap, PhoneFrame } from "../../design-system/primitives";
import { useQuester } from "../store";

export function Navigate() {
  const { state, goToStop } = useQuester();
  const trail = state.trail!;
  const stops = trail.stops;

  const currentIndex = stops.findIndex((s) => s.order === state.currentOrder);
  const currentStop = stops[currentIndex];
  const stopNumber = currentIndex + 1;
  const totalStops = stops.length;

  const poiName = currentStop.poi.name;
  const subtitle =
    currentStop.poi.facts.length > 0
      ? currentStop.poi.facts[0]
      : "Grote Markt · historisch";

  const mapStops = [
    { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
    ...trail.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
  ];

  return (
    <PhoneFrame>
      {/* Full-screen map */}
      <div style={{ position: "absolute", inset: 0 }}>
        <TileMap
          stops={mapStops}
          routeGeometry={trail.route_geometry}
          activeOrder={state.currentOrder}
          showUserDot
        />
      </div>

      {/* Progress header */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 11,
          background: "rgba(250,246,236,.92)",
          backdropFilter: "blur(6px)",
          border: "1px solid #e0d5bf",
          borderRadius: 16,
          padding: "11px 13px",
          boxShadow: "0 8px 20px -12px rgba(33,31,27,.4)",
          zIndex: 5,
        }}
      >
        {/* Back chevron */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "#ece2cf",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#283a5e"
            strokeWidth="2.2"
          >
            <path d="M15 6 9 12 15 18" />
          </svg>
        </div>

        {/* Label + segment bar */}
        <div style={{ flex: 1 }}>
          <div style={{ font: "700 13px/1 'DM Sans'", color: "#211f1b" }}>
            Stop {stopNumber} van {totalStops}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
            {stops.map((_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i < currentIndex ? "#b5453a" : i === currentIndex ? "#b5453a" : "#ddd2bd",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Compass */}
      <div
        style={{
          position: "absolute",
          top: 118,
          right: 16,
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: "rgba(250,246,236,.92)",
          border: "1px solid #e0d5bf",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 14px -8px rgba(33,31,27,.5)",
          zIndex: 5,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="#cbbfa6" strokeWidth="1" />
          <path d="M12 12 14.5 6.5 12 17 9.5 6.5Z" fill="#b5453a" />
          <text
            x="12"
            y="5"
            textAnchor="middle"
            fontFamily="Spline Sans Mono"
            fontSize="5.5"
            fontWeight="600"
            fill="#283a5e"
          >
            N
          </text>
        </svg>
      </div>

      {/* Bottom next-stop sheet */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#faf6ec",
          borderTop: "1px solid #e0d5bf",
          borderRadius: "24px 24px 0 0",
          padding: "16px 20px 24px",
          boxShadow: "0 -12px 30px -16px rgba(33,31,27,.35)",
          zIndex: 5,
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: "#ddd2bd",
            margin: "0 auto 14px",
          }}
        />

        {/* POI info + distance */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <EyebrowLabel color="#b5453a">VOLGENDE STOP</EyebrowLabel>
            <div
              style={{
                font: "400 25px/1.05 'DM Serif Display'",
                color: "#283a5e",
                marginTop: 6,
              }}
            >
              {poiName}
            </div>
            <div
              style={{
                font: "500 12px/1 'DM Sans'",
                color: "#8a7f6d",
                marginTop: 6,
              }}
            >
              {typeof subtitle === "string" ? subtitle : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ font: "400 28px/1 'DM Serif Display'", color: "#211f1b" }}>
              280
              <span style={{ font: "600 13px/1 'DM Sans'", color: "#8a7f6d" }}> m</span>
            </div>
            <div
              style={{
                font: "500 11px/1 'Spline Sans Mono'",
                color: "#8a7f6d",
                marginTop: 5,
              }}
            >
              ~4 min lopen
            </div>
          </div>
        </div>

        {/* Traffic safety note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "15px 0",
            padding: "9px 12px",
            background: "#f6efe0",
            borderRadius: 10,
            border: "1px dashed #d9c9a2",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c5912f"
            strokeWidth="2"
          >
            <path d="M12 3 22 20H2Z" />
            <line x1="12" y1="10" x2="12" y2="14" />
            <circle cx="12" cy="17" r="0.6" fill="#c5912f" />
          </svg>
          <span style={{ font: "500 11.5px/1.3 'DM Sans'", color: "#8a7f6d" }}>
            Let op het verkeer — kijk niet alleen op je scherm.
          </span>
        </div>

        {/* Action row: arrive button + points pill */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Button
            variant="primary"
            onClick={() => goToStop(state.currentOrder)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 14,
              boxShadow: "0 10px 22px -12px rgba(150,58,48,.8)",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
            >
              <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.3" />
            </svg>
            Ik ben er
          </Button>

          {/* Points pill */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 52,
              borderRadius: 14,
              background: "#283a5e",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <span style={{ font: "700 17px/1 'DM Sans'" }}>{state.points}</span>
            <span
              style={{
                font: "600 9px/1 'Spline Sans Mono'",
                color: "#aeb9d2",
                marginTop: 3,
                letterSpacing: ".5px",
              }}
            >
              PUNTEN
            </span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
