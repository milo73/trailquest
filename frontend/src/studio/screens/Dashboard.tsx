import { useNavigate } from "react-router-dom";
import { StudioChrome } from "../StudioChrome";
import { MOCK_TRAILS, MOCK_DASHBOARD_STATS, type StudioTrailCard } from "../mock/trails";

function statusBadge(status: StudioTrailCard["status"]) {
  if (status === "concept") {
    return (
      <span
        style={{
          position: "absolute",
          top: 11,
          right: 11,
          font: "700 10px/1 var(--tq-sans)",
          color: "#a3781f",
          background: "#f8efda",
          border: "1px solid #e6cf9a",
          borderRadius: 6,
          padding: "5px 9px",
        }}
      >
        Concept
      </span>
    );
  }
  if (status === "live") {
    return (
      <span
        style={{
          position: "absolute",
          top: 11,
          right: 11,
          font: "700 10px/1 var(--tq-sans)",
          color: "#3a5a2f",
          background: "#e7eed7",
          border: "1px solid #cdd9b3",
          borderRadius: 6,
          padding: "5px 9px",
        }}
      >
        Live
      </span>
    );
  }
  return (
    <span
      style={{
        position: "absolute",
        top: 11,
        right: 11,
        font: "700 10px/1 var(--tq-sans)",
        color: "#5a6a8a",
        background: "#e3e8f1",
        border: "1px solid #c6cfdf",
        borderRadius: 6,
        padding: "5px 9px",
      }}
    >
      In review
    </span>
  );
}

function TrailCard({ trail, onClick }: { trail: StudioTrailCard; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#faf6ec",
        border: "1px solid #e6dcc6",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      {/* Map thumbnail */}
      <div style={{ position: "relative", height: 104 }}>
        <svg viewBox="0 0 380 104" style={{ width: "100%", height: "100%" }}>
          <rect width="380" height="104" fill="#e8dec9" />
          <g stroke="#dccfb4" strokeWidth="9">
            <line x1="-10" y1="50" x2="400" y2="42" />
            <line x1="160" y1="-10" x2="170" y2="120" />
          </g>
          <path d="M50 80 110 30 200 60 300 35" fill="none" stroke="#b5453a" strokeWidth="3" strokeDasharray="2 8" />
          <circle cx="110" cy="30" r="8" fill="#b5453a" />
          <circle cx="200" cy="60" r="8" fill="#b5453a" />
        </svg>
        {statusBadge(trail.status)}
      </div>

      {/* Card body */}
      <div style={{ padding: "15px 16px" }}>
        <div style={{ font: "400 18px/1.1 var(--tq-serif)", color: "#283a5e" }}>{trail.title}</div>
        <div style={{ font: "500 11px/1 var(--tq-sans)", color: "#8a7f6d", marginTop: 7 }}>
          {trail.theme} · {trail.distanceKm.toFixed(1).replace(".", ",")} km · {trail.stops} stops
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 14,
            paddingTop: 13,
            borderTop: "1px solid #ece2cf",
            font: "500 11px/1 var(--tq-mono)",
            color: "#8a7f6d",
          }}
        >
          {trail.status === "concept" && (
            <>
              <span>nog niet live</span>
              {trail.warnings != null && (
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, color: "#a3781f" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c5912f" strokeWidth="2.2">
                    <path d="M12 3 22 20H2Z" />
                  </svg>
                  {trail.warnings}
                </span>
              )}
            </>
          )}
          {trail.status === "live" && (
            <>
              <span>{trail.plays}× gespeeld</span>
              {trail.completion != null && <span>{trail.completion}% af</span>}
              {trail.rating != null && (
                <span style={{ marginLeft: "auto", color: "#c5912f" }}>{trail.rating.toFixed(1).replace(".", ",")} ★</span>
              )}
            </>
          )}
          {trail.status === "review" && <span>wacht op moderatie</span>}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();

  const playsFormatted = MOCK_DASHBOARD_STATS.plays.toLocaleString("nl-NL");

  return (
    <StudioChrome breadcrumb="mijn-tochten">
      <div style={{ background: "#fdfbf6", padding: "26px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ font: "400 30px/1 var(--tq-serif)", color: "#283a5e" }}>Mijn tochten</div>
            <div style={{ font: "500 13px/1 var(--tq-sans)", color: "#8a7f6d", marginTop: 8 }}>
              {MOCK_DASHBOARD_STATS.trails} tochten · TrailQuest Studio voor Haarlem
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#fff", background: "#283a5e", borderRadius: 20, padding: "9px 14px" }}>
              Alle
            </span>
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#6b6256", background: "#faf6ec", border: "1px solid #e0d5bf", borderRadius: 20, padding: "9px 14px" }}>
              Gepubliceerd
            </span>
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#6b6256", background: "#faf6ec", border: "1px solid #e0d5bf", borderRadius: 20, padding: "9px 14px" }}>
              Concept
            </span>
            <span style={{ font: "600 12px/1 var(--tq-sans)", color: "#6b6256", background: "#faf6ec", border: "1px solid #e0d5bf", borderRadius: 20, padding: "9px 14px" }}>
              In review
            </span>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, margin: "20px 0 22px" }}>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{MOCK_DASHBOARD_STATS.trails}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>TOCHTEN</div>
          </div>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{playsFormatted}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>KEER GESPEELD</div>
          </div>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>
              {MOCK_DASHBOARD_STATS.rating.toFixed(1).replace(".", ",")}{" "}
              <span style={{ font: "600 14px var(--tq-sans)", color: "#c5912f" }}>★</span>
            </div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>GEM. BEOORDELING</div>
          </div>
          <div style={{ background: "#e7eed7", border: "1px solid #cdd9b3", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#3a5a2f" }}>{MOCK_DASHBOARD_STATS.correctness}%</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#5a6a3f", marginTop: 6 }}>CONTENT-CORRECT</div>
          </div>
        </div>

        {/* Trail card grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {MOCK_TRAILS.map((trail) => (
            <TrailCard
              key={trail.id}
              trail={trail}
              onClick={() => navigate("/studio/route")}
            />
          ))}

          {/* "Nieuwe tocht maken" card */}
          <div
            onClick={() => navigate("/studio/route")}
            style={{
              border: "1.5px dashed #cbbfa6",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 11,
              color: "#8a7f6d",
              minHeight: 200,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#f3ede0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span style={{ font: "600 13px/1 var(--tq-sans)" }}>Nieuwe tocht maken</span>
            <span style={{ font: "500 11px/1.4 var(--tq-sans)", color: "#a99e88", textAlign: "center", maxWidth: 160 }}>
              Genereer een concept of bouw handmatig
            </span>
          </div>
        </div>
      </div>
    </StudioChrome>
  );
}
