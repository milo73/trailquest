import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StudioChrome } from "../StudioChrome";
import { useDraft } from "../draftStore";
import { getValidation, publishDraft } from "../../api/drafts";
import type { ValidationResult } from "../../api/types";

export function Validation() {
  const { draft, loadDraft } = useDraft();
  const navigate = useNavigate();
  const [report, setReport] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Mount-load: restore draft from localStorage on deep-link / reload
  useEffect(() => {
    if (!draft) {
      const savedId = localStorage.getItem("tq.studio.draft");
      if (savedId) {
        loadDraft(savedId);
      } else {
        // No draft to load — stop showing the loading state
        setLoading(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the report when a draft is available
  useEffect(() => {
    if (!draft) return;
    setLoading(true);
    setLoadError(false);
    getValidation(draft.id)
      .then((r) => setReport(r))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePublish() {
    if (!draft || !report || report.blocking > 0) return;
    setPublishError(null);
    try {
      await publishDraft(draft.id);
      setPublished(true);
    } catch {
      setPublishError("Kan nog niet publiceren — los de blokkerende issues op.");
    }
  }

  return (
    <StudioChrome breadcrumb="publiceren">
      <div
        style={{
          height: 782,
          overflow: "hidden",
          background: "#fdfbf6",
          display: "flex",
        }}
      >
        {/* ── Left: checklist panel ── */}
        <div style={{ flex: 1, padding: "30px 34px", overflow: "hidden" }}>
          <div
            style={{
              font: "600 11px/1 var(--tq-mono)",
              color: "#b5453a",
              letterSpacing: 1.5,
            }}
          >
            PRE-PUBLISH CONTROLE
          </div>
          <div
            style={{
              font: "400 30px/1.1 var(--tq-serif)",
              color: "#283a5e",
              marginTop: 9,
            }}
          >
            Klaar om te publiceren?
          </div>
          <div
            style={{
              font: "500 13px/1.5 var(--tq-sans)",
              color: "#8a7f6d",
              marginTop: 9,
              maxWidth: 520,
            }}
          >
            Kwaliteit is een poort: we controleren grounding, beloopbaarheid, afstand en toon vóór
            de tocht live gaat.
          </div>

          {/* Loading / error / no draft states */}
          {!loading && !draft && (
            <div style={{ marginTop: 24, font: "500 14px/1.5 var(--tq-sans)", color: "#8a7f6d" }}>
              Geen tocht geselecteerd — open er een via het dashboard
            </div>
          )}
          {loading && (
            <div style={{ marginTop: 24, font: "500 14px/1.5 var(--tq-sans)", color: "#8a7f6d" }}>
              Rapport laden…
            </div>
          )}
          {loadError && (
            <div style={{ marginTop: 24, font: "500 14px/1.5 var(--tq-sans)", color: "#b5453a" }}>
              Kon het validatierapport niet laden
            </div>
          )}

          {/* Checks list */}
          {report && (
            <div
              data-testid="checks-list"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 11,
                marginTop: 24,
              }}
            >
              {report.checks.map((check) => {
                const isBlocking = check.status === "blocking";
                const isWarning = check.status === "warning";
                const isOk = check.status === "ok";

                // Colour tokens per status
                const bgColor = isBlocking ? "#fdf0ee" : isWarning ? "#fdf6e8" : "#fff";
                const borderColor = isBlocking ? "1.5px solid #d9867f" : isWarning ? "1.5px solid #e6cf9a" : "1px solid #e6dcc6";
                const iconBg = isBlocking ? "#f5ccc8" : isWarning ? "#f3e3bd" : "#e7eed7";
                const iconStroke = isBlocking ? "#b5453a" : isWarning ? "#c5912f" : "#6f8a4f";
                const labelColor = isBlocking ? "#7a1f1a" : isWarning ? "#8a7039" : "#211f1b";
                const detailColor = isBlocking ? "#b5453a" : isWarning ? "#a3781f" : "#8a7f6d";

                return (
                  <div
                    key={check.id}
                    style={{
                      display: "flex",
                      alignItems: isOk ? "center" : "flex-start",
                      gap: 14,
                      background: bgColor,
                      border: borderColor,
                      borderRadius: 12,
                      padding: "15px 17px",
                    }}
                  >
                    {/* Icon */}
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: iconBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isOk ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={iconStroke}
                          strokeWidth="2.6"
                        >
                          <path d="M5 12l4 4 10-10" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={iconStroke}
                          strokeWidth="2.4"
                        >
                          <path d="M12 3 22 20H2Z" />
                          <line x1="12" y1="10" x2="12" y2="14.5" />
                          <circle cx="12" cy="17.5" r="0.6" fill={iconStroke} />
                        </svg>
                      )}
                    </span>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          font: "700 14px/1.2 var(--tq-sans)",
                          color: labelColor,
                        }}
                      >
                        {check.label}
                      </div>
                      <div
                        style={{
                          font: "500 12px/1.4 var(--tq-sans)",
                          color: detailColor,
                          marginTop: isOk ? 3 : 4,
                        }}
                      >
                        {check.detail}
                      </div>
                    </div>

                    {/* Status label */}
                    {isOk && (
                      <span
                        style={{
                          font: "600 12px/1 var(--tq-mono)",
                          color: "var(--tq-green-ink, #3a5a2f)",
                        }}
                      >
                        ok
                      </span>
                    )}
                    {isWarning && (
                      <span
                        style={{
                          font: "600 12px/1 var(--tq-mono)",
                          color: "var(--tq-gold-ink, #c5912f)",
                        }}
                      >
                        waarschuwing
                      </span>
                    )}
                    {isBlocking && (
                      <span
                        style={{
                          font: "600 12px/1 var(--tq-mono)",
                          color: "var(--tq-terracotta-deep, #b5453a)",
                        }}
                      >
                        blokkerend
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Back navigation */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => navigate("/studio/route")}
              style={{
                background: "none",
                border: "none",
                color: "#8a7f6d",
                font: "500 13px/1 var(--tq-sans)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← Terug naar route-editor
            </button>
          </div>
        </div>

        {/* ── Right: navy summary rail ── */}
        <div
          style={{
            width: 380,
            flexShrink: 0,
            background: "#283a5e",
            color: "#fff",
            padding: "30px 28px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              font: "600 11px/1 var(--tq-mono)",
              color: "#aeb9d2",
              letterSpacing: 1,
            }}
          >
            SAMENVATTING
          </div>

          {/* Blocking / warnings counts */}
          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <div
              data-testid="blocking-count-card"
              style={{
                flex: 1,
                background: "rgba(255,255,255,.07)",
                borderRadius: 12,
                padding: 15,
              }}
            >
              <div
                style={{
                  font: "400 28px/1 var(--tq-serif)",
                  color: "#e8908a",
                }}
              >
                {report?.blocking ?? "–"}
              </div>
              <div
                style={{
                  font: "500 10px/1.3 var(--tq-mono)",
                  color: "#aeb9d2",
                  marginTop: 6,
                }}
              >
                BLOKKEREND
              </div>
            </div>
            <div
              data-testid="warning-count-card"
              style={{
                flex: 1,
                background: "rgba(255,255,255,.07)",
                borderRadius: 12,
                padding: 15,
              }}
            >
              <div
                style={{
                  font: "400 28px/1 var(--tq-serif)",
                  color: "#e6cf9a",
                }}
              >
                {report?.warnings ?? "–"}
              </div>
              <div
                style={{
                  font: "500 10px/1.3 var(--tq-mono)",
                  color: "#aeb9d2",
                  marginTop: 6,
                }}
              >
                WAARSCHUWING
              </div>
            </div>
          </div>

          {/* Per-stop grounding list */}
          <div
            style={{
              marginTop: 22,
              font: "600 11px/1 var(--tq-mono)",
              color: "#aeb9d2",
              letterSpacing: 1,
            }}
          >
            GROUNDING PER STOP
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 14,
            }}
          >
            {report?.per_stop.map((stop) => (
              <div
                key={stop.order}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  font: "500 12px/1 var(--tq-sans)",
                  color: stop.grounded ? "#e7e2d6" : "#e6cf9a",
                }}
              >
                {stop.grounded ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#9fb87f"
                    strokeWidth="2.6"
                  >
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#e6cf9a"
                    strokeWidth="2.4"
                  >
                    <path d="M12 3 22 20H2Z" />
                  </svg>
                )}
                <span>{stop.order}</span>
                {" · "}
                <span>{stop.name}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    font: "500 10px var(--tq-mono)",
                    color: stop.grounded ? "#7e8aa6" : "#d9c08a",
                  }}
                >
                  {stop.sources}
                </span>
              </div>
            ))}
          </div>

          {/* Publish button / confirmation */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingTop: 22,
            }}
          >
            {published ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <div
                  style={{
                    width: "100%",
                    height: 52,
                    borderRadius: 14,
                    background: "#6f8a4f",
                    color: "#fff",
                    font: "700 15px/1 var(--tq-sans)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 9,
                  }}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.4"
                  >
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                  Gepubliceerd — Live
                </div>
                <a
                  href="/play"
                  style={{
                    font: "600 13px/1 var(--tq-sans)",
                    color: "#aeb9d2",
                    textDecoration: "underline",
                  }}
                >
                  Speel in de app
                </a>
              </div>
            ) : !loading && (
              <button
                onClick={handlePublish}
                disabled={!report || report.blocking > 0}
                style={{
                  width: "100%",
                  height: 52,
                  border: "none",
                  borderRadius: 14,
                  background: !report || report.blocking > 0 ? "#7a8aa6" : "#b5453a",
                  color: "#fff",
                  font: "700 15px/1 var(--tq-sans)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  cursor: !report || report.blocking > 0 ? "not-allowed" : "pointer",
                  boxShadow: !report || report.blocking > 0 ? "none" : "0 12px 24px -12px rgba(0,0,0,.5)",
                }}
              >
                Publiceren
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
            {publishError && (
              <div
                style={{
                  font: "500 12px/1.4 var(--tq-sans)",
                  color: "#e8908a",
                  textAlign: "center",
                }}
              >
                {publishError}
              </div>
            )}
            <div
              style={{
                textAlign: "center",
                font: "500 11px/1.4 var(--tq-sans)",
                color: "#8e9ab8",
              }}
            >
              Direct live na publicatie. Spelers kunnen feiten blijven melden.
            </div>
          </div>
        </div>
      </div>
    </StudioChrome>
  );
}
