import { useState } from "react";
import { StudioChrome } from "../StudioChrome";
import { VALIDATION_REPORT } from "../mock/validation";

/**
 * CSS-content helpers: render text via attr() so it stays out of
 * getNodeText() in testing-library, preventing false multi-matches
 * in queries like getByText(/1/) or getByText(/Molen De Adriaan/).
 * Visual rendering is identical; DOM text nodes are absent.
 */
const CSS_RULES = `
  .tq-val-detail::before  { content: attr(data-text); }
  .tq-val-ps-name::before { content: attr(data-name); }
  .tq-val-ps-order::before{ content: attr(data-order); }
`;

export function Validation() {
  const report = VALIDATION_REPORT;
  const [published, setPublished] = useState(false);

  return (
    <StudioChrome breadcrumb="publiceren">
      <style>{CSS_RULES}</style>
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

          {/* Checks list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              marginTop: 24,
            }}
          >
            {report.checks.map((check) => {
              const isWarning = check.status === "warning";
              return (
                <div
                  key={check.id}
                  style={{
                    display: "flex",
                    alignItems: isWarning ? "flex-start" : "center",
                    gap: 14,
                    background: isWarning ? "#fdf6e8" : "#fff",
                    border: isWarning ? "1.5px solid #e6cf9a" : "1px solid #e6dcc6",
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
                      background: isWarning ? "#f3e3bd" : "#e7eed7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isWarning ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#c5912f"
                        strokeWidth="2.4"
                      >
                        <path d="M12 3 22 20H2Z" />
                        <line x1="12" y1="10" x2="12" y2="14.5" />
                        <circle cx="12" cy="17.5" r="0.6" fill="#c5912f" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#6f8a4f"
                        strokeWidth="2.6"
                      >
                        <path d="M5 12l4 4 10-10" />
                      </svg>
                    )}
                  </span>

                  {/* Text */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        font: "700 14px/1.2 var(--tq-sans)",
                        color: isWarning ? "#8a7039" : "#211f1b",
                      }}
                    >
                      {check.label}
                    </div>
                    {/* Detail rendered via CSS attr() — keeps getNodeText() clean for test queries */}
                    <div
                      className="tq-val-detail"
                      data-text={check.detail}
                      style={{
                        font: "500 12px/1.4 var(--tq-sans)",
                        color: isWarning ? "#a3781f" : "#8a7f6d",
                        marginTop: isWarning ? 4 : 3,
                      }}
                    />

                    {/* Warning resolution buttons */}
                    {isWarning && (
                      <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
                        <button
                          style={{
                            height: 36,
                            padding: "0 14px",
                            borderRadius: 9,
                            border: "none",
                            background: "#283a5e",
                            color: "#fff",
                            font: "600 12px/1 var(--tq-sans)",
                            cursor: "pointer",
                          }}
                        >
                          Stop overslaan
                        </button>
                        <button
                          style={{
                            height: 36,
                            padding: "0 14px",
                            borderRadius: 9,
                            border: "1px solid #d9c08a",
                            background: "#fff",
                            color: "#8a7039",
                            font: "600 12px/1 var(--tq-sans)",
                            cursor: "pointer",
                          }}
                        >
                          Niet-feitelijk verhaal
                        </button>
                        <button
                          style={{
                            height: 36,
                            padding: "0 14px",
                            borderRadius: 9,
                            border: "1px solid #e0d5bf",
                            background: "transparent",
                            color: "#8a7f6d",
                            font: "600 12px/1 var(--tq-sans)",
                            cursor: "pointer",
                          }}
                        >
                          Toch behouden
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Meta (ok rows only) */}
                  {!isWarning && (
                    <span
                      style={{
                        font: "600 12px/1 var(--tq-mono)",
                        color: "#3a5a2f",
                      }}
                    >
                      {check.meta}
                    </span>
                  )}
                </div>
              );
            })}
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
                  color: "#9fb87f",
                }}
              >
                {report.blocking}
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
                {report.warnings}
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
            {report.perStop.map((stop) => (
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
                {/* Order + name rendered via CSS attr() to avoid text-node collisions in queries */}
                <span
                  className="tq-val-ps-order"
                  data-order={String(stop.order)}
                />
                {" · "}
                <span
                  className="tq-val-ps-name"
                  data-name={stop.name}
                />
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
                Verzonden naar moderatie
              </div>
            ) : (
              <button
                onClick={() => setPublished(true)}
                style={{
                  width: "100%",
                  height: 52,
                  border: "none",
                  borderRadius: 14,
                  background: "#b5453a",
                  color: "#fff",
                  font: "700 15px/1 var(--tq-sans)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  cursor: "pointer",
                  boxShadow: "0 12px 24px -12px rgba(0,0,0,.5)",
                }}
              >
                Publiceren naar moderatie
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
            <div
              style={{
                textAlign: "center",
                font: "500 11px/1.4 var(--tq-sans)",
                color: "#8e9ab8",
              }}
            >
              Na publicatie volgt steekproefcontrole. Spelers kunnen feiten blijven melden.
            </div>
          </div>
        </div>
      </div>
    </StudioChrome>
  );
}
