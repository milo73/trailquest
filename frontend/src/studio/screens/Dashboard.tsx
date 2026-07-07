import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StudioChrome } from "../StudioChrome";
import { listDrafts } from "../../api/drafts";
import { useDraft } from "../draftStore";
import type { DraftCreate, DraftTrail } from "../../api/types";
import { NewTrailForm } from "../components/NewTrailForm";

function DeleteConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(33, 31, 27, 0.45)",
          zIndex: 200,
        }}
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Tocht verwijderen"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: 380,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--tq-paper, #fdfbf6)",
          border: "1px solid var(--tq-border, #e6dcc6)",
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
          padding: "28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ font: "600 16px/1.3 var(--tq-sans, sans-serif)", color: "#283a5e" }}>
          Tocht verwijderen?
        </div>
        <div style={{ font: "400 14px/1.5 var(--tq-sans, sans-serif)", color: "#6b6256" }}>
          Dit kan niet ongedaan worden.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid #e0d5bf",
              background: "transparent",
              font: "600 13px/1 var(--tq-sans, sans-serif)",
              color: "#6b6256",
              cursor: "pointer",
            }}
          >
            Annuleren
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#b5453a",
              font: "600 13px/1 var(--tq-sans, sans-serif)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Verwijderen
          </button>
        </div>
      </div>
    </>
  );
}

function formatKm(km: number): string {
  return km.toFixed(1).replace(".", ",");
}

function statusBadge(status: string) {
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
  if (status === "live" || status === "published") {
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

function DraftCard({ draft, onClick, onDelete }: { draft: DraftTrail; onClick: () => void; onDelete: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#faf6ec",
        border: "1px solid #e6dcc6",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
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
        {statusBadge(draft.status)}
      </div>

      {/* Card body */}
      <div style={{ padding: "15px 16px" }}>
        <div style={{ font: "400 18px/1.1 var(--tq-serif)", color: "#283a5e" }}>{draft.title}</div>
        <div style={{ font: "500 11px/1 var(--tq-sans)", color: "#8a7f6d", marginTop: 7 }}>
          {draft.theme} · {formatKm(draft.actual_distance_km)} km · {draft.stops.length} stops
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
          {draft.status === "concept" && <span>nog niet live</span>}
          {draft.status === "review" && <span>wacht op moderatie</span>}
          {draft.status === "published" && (
            <>
              <span>gepubliceerd</span>
              <a
                href="/play"
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginLeft: "auto",
                  font: "600 11px/1 var(--tq-mono)",
                  color: "#3a5a2f",
                  textDecoration: "underline",
                }}
              >
                Speel in app
              </a>
            </>
          )}
          <button
            aria-label="Verwijderen"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "500 11px/1 var(--tq-mono)",
              color: "#b5453a",
              padding: 0,
            }}
          >
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterValue = "alle" | "published" | "concept" | "review";

export function Dashboard() {
  const navigate = useNavigate();
  const { createDraft, loadDraft, removeDraft } = useDraft();
  const [drafts, setDrafts] = useState<DraftTrail[]>([]);
  const [filter, setFilter] = useState<FilterValue>("alle");
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function refreshDrafts() {
    listDrafts()
      .then((d) => setDrafts(d))
      .catch(() => setDrafts([]));
  }

  useEffect(() => {
    refreshDrafts();
  }, []);

  const openDraft = useCallback(async (id: string) => {
    try {
      await loadDraft(id);
      navigate("/studio/route");
    } catch {
      // failed load — stay on dashboard, don't navigate
    }
  }, [loadDraft, navigate]);

  async function handleGenerate(req: DraftCreate) {
    setCreating(true);
    try {
      await createDraft(req);
      setModalOpen(false);
      navigate("/studio/route");
    } catch (e) {
      throw e;
    } finally {
      setCreating(false);
    }
  }

  // Computed stats from real drafts
  const totalCount = drafts.length;
  const liveCount = drafts.filter((d) => d.status === "published").length;
  const conceptCount = drafts.filter((d) => d.status === "concept").length;
  const stopsTotal = drafts.reduce((sum, d) => sum + d.stops.length, 0);

  // Filtered view
  const visibleDrafts = filter === "alle" ? drafts : drafts.filter((d) => d.status === filter);

  const chipStyle = (value: FilterValue) =>
    filter === value
      ? { font: "600 12px/1 var(--tq-sans)", color: "#fff", background: "#283a5e", borderRadius: 20, padding: "9px 14px", border: "none", cursor: "pointer" as const }
      : { font: "600 12px/1 var(--tq-sans)", color: "#6b6256", background: "#faf6ec", border: "1px solid #e0d5bf", borderRadius: 20, padding: "9px 14px", cursor: "pointer" as const };

  return (
    <StudioChrome breadcrumb="mijn-tochten">
      <div style={{ background: "#fdfbf6", padding: "26px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ font: "400 30px/1 var(--tq-serif)", color: "#283a5e" }}>Mijn tochten</div>
            <div style={{ font: "500 13px/1 var(--tq-sans)", color: "#8a7f6d", marginTop: 8 }}>
              {totalCount} tochten · TrailQuest Studio voor Haarlem
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setFilter("alle")} style={chipStyle("alle")}>Alle</button>
            <button onClick={() => setFilter("published")} style={chipStyle("published")}>Gepubliceerd</button>
            <button onClick={() => setFilter("concept")} style={chipStyle("concept")}>Concept</button>
            <button onClick={() => setFilter("review")} style={chipStyle("review")}>In review</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, margin: "20px 0 22px" }}>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{totalCount}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>TOCHTEN</div>
          </div>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{liveCount}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>LIVE</div>
          </div>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{conceptCount}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>CONCEPTEN</div>
          </div>
          <div style={{ background: "#faf6ec", border: "1px solid #e6dcc6", borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ font: "400 26px/1 var(--tq-serif)", color: "#283a5e" }}>{stopsTotal}</div>
            <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d", marginTop: 6 }}>STOPS</div>
          </div>
        </div>

        {/* Trail card grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {visibleDrafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onClick={() => openDraft(draft.id)}
              onDelete={() => setDeleteTargetId(draft.id)}
            />
          ))}

          {/* "Nieuwe tocht maken" card */}
          <div
            onClick={creating ? undefined : () => setModalOpen(true)}
            role="button"
            aria-disabled={creating}
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
              cursor: creating ? "default" : "pointer",
              opacity: creating ? 0.6 : 1,
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
      {modalOpen && (
        <NewTrailForm
          submitting={creating}
          onClose={() => setModalOpen(false)}
          onSubmit={handleGenerate}
        />
      )}
      {deleteTargetId && (
        <DeleteConfirmDialog
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={async () => {
            const id = deleteTargetId;
            setDeleteTargetId(null);
            await removeDraft(id);
            refreshDrafts();
          }}
        />
      )}
    </StudioChrome>
  );
}
