import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDraft } from "./draftStore";
import { NewTrailForm } from "./components/NewTrailForm";
import type { DraftCreate } from "../api/types";

type StudioChromeProps = {
  breadcrumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function StudioChrome({ breadcrumb = "mijn-tochten", actions, children }: StudioChromeProps) {
  const navigate = useNavigate();
  const { createDraft } = useDraft();
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleGenerate(req: DraftCreate) {
    setCreating(true);
    try {
      await createDraft(req);
      setShowNew(false);
      navigate("/studio/route");
    } catch (e) {
      throw e;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 13,
        overflow: "hidden",
        boxShadow: "0 40px 80px -34px rgba(33,31,27,.5), 0 0 0 1px rgba(40,30,20,.06)",
        minHeight: "100vh",
      }}
    >
      {/* Browser chrome bar */}
      <div
        style={{
          height: 40,
          background: "#ece4d3",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 16px",
          borderBottom: "1px solid #ddd0b6",
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#d98b6a", display: "block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#d9b86a", display: "block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#9fb87f", display: "block" }} />
        <div
          style={{
            flex: 1,
            maxWidth: 420,
            margin: "0 auto",
            background: "#f6efe0",
            border: "1px solid #ddd0b6",
            borderRadius: 7,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "500 12px/1 var(--tq-mono)",
            color: "#8a7f6d",
          }}
        >
          trailquest.studio / {breadcrumb}
        </div>
      </div>

      {/* Top navigation */}
      <div
        style={{
          height: 62,
          background: "#faf6ec",
          borderBottom: "1px solid #e6dcc6",
          display: "flex",
          alignItems: "center",
          padding: "0 22px",
          gap: 18,
        }}
      >
        <button
          onClick={() => navigate("/studio")}
          aria-label="TrailQuest — naar mijn tochten"
          style={{
            font: "400 22px/1 var(--tq-serif)",
            color: "#b5453a",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          TrailQuest
        </button>
        <span
          style={{
            font: "600 10px/1 var(--tq-mono)",
            color: "#8a7f6d",
            letterSpacing: 2,
            border: "1px solid #ddd0b6",
            borderRadius: 5,
            padding: "4px 7px",
          }}
        >
          STUDIO
        </span>
        <div style={{ display: "flex", gap: 20, marginLeft: 14, font: "600 13px/1 var(--tq-sans)" }}>
          <span
            style={{
              color: "#211f1b",
              borderBottom: "2px solid #b5453a",
              paddingBottom: 21,
              marginBottom: -23,
              cursor: "pointer",
            }}
          >
            Mijn tochten
          </span>
          <span style={{ color: "#8a7f6d", cursor: "pointer" }}>Bibliotheek</span>
          <span style={{ color: "#8a7f6d", cursor: "pointer" }}>Inzichten</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {actions}
          <button
            onClick={() => setShowNew(true)}
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: "#b5453a",
              color: "#fff",
              font: "700 13px/1 var(--tq-sans)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "0 8px 18px -10px rgba(150,58,48,.8)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nieuwe tocht
          </button>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#283a5e",
              color: "#fff",
              font: "700 13px/36px var(--tq-sans)",
              textAlign: "center",
              display: "block",
            }}
          >
            RK
          </span>
        </div>
      </div>

      {/* Page content */}
      {children}

      {showNew && (
        <NewTrailForm
          submitting={creating}
          onClose={() => setShowNew(false)}
          onSubmit={handleGenerate}
        />
      )}
    </div>
  );
}
