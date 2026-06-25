import { useState } from "react";
import { submitAnswer } from "../../api/trails";
import {
  Button,
  EyebrowLabel,
  PhoneFrame,
  SourceBadge,
} from "../../design-system/primitives";
import { useQuester } from "../store";

export function Stop() {
  const { state, recordSolve, arriveAtNextOrFinish } = useQuester();
  const trail = state.trail!;
  const stop = trail.stops.find((s) => s.order === state.currentOrder)!;
  const { poi, story, question } = stop;

  // Distinct fact sources (by source name)
  const distinctSources = Array.from(
    new Map(poi.facts.map((f) => [f.source.name, f.source])).values()
  );

  // Local state
  const [answer, setAnswer] = useState("");
  const [attempt, setAttempt] = useState(1);
  const [usedHint, setUsedHint] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [reportedFact, setReportedFact] = useState(false);

  async function handleSubmit() {
    const result = await submitAnswer(trail.id, {
      stop_order: stop.order,
      answer,
      attempt,
    });

    setFeedback(result.feedback);

    if (result.unlocked_next) {
      recordSolve(stop.order, {
        type: question.type,
        correct: result.correct,
        attempt,
        usedHint,
      });
      if (result.revealed_answer) {
        setRevealedAnswer(result.revealed_answer);
      }
      setDone(true);
    } else {
      setAttempt((a) => a + 1);
    }
  }

  function handleHint() {
    setUsedHint(true);
    setShowHint(true);
  }

  return (
    <PhoneFrame>
      {/* Map header */}
      <div style={{ position: "relative", height: 160, background: "#cdd9d6" }}>
        <svg
          viewBox="0 0 360 160"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <rect width="360" height="160" fill="#cdd9d6" />
          <g stroke="#bccac6" strokeWidth="9">
            <line x1="-10" y1="70" x2="380" y2="58" />
            <line x1="160" y1="-10" x2="175" y2="170" />
            <line x1="60" y1="-10" x2="48" y2="170" />
          </g>
          <path
            d="M30 120 110 50 200 90 290 40 350 110"
            fill="none"
            stroke="#b5453a"
            strokeWidth="3.5"
            strokeDasharray="2 9"
          />
          <g>
            <circle cx="200" cy="78" r="20" fill="#b5453a" />
            <text
              x="200"
              y="84"
              textAnchor="middle"
              fontFamily="DM Sans"
              fontWeight="700"
              fontSize="16"
              fill="#fff"
            >
              {stop.order}
            </text>
          </g>
        </svg>

        {/* Back button */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 16,
            width: 38,
            height: 38,
            borderRadius: 11,
            background: "rgba(250,246,236,.92)",
            border: "1px solid #e0d5bf",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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

        {/* Points pill */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#283a5e",
            color: "#fff",
            borderRadius: 20,
            padding: "7px 12px",
            font: "700 13px/1 'DM Sans'",
          }}
        >
          {state.points}
          <span style={{ font: "600 9px/1 'Spline Sans Mono'", color: "#aeb9d2" }}>
            PTN
          </span>
        </div>
      </div>

      {/* Content panel */}
      <div
        style={{
          position: "absolute",
          top: 138,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#f3ede0",
          borderRadius: "24px 24px 0 0",
          padding: "20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 13,
          overflowY: "auto",
        }}
      >
        {/* Eyebrow + POI name */}
        <div>
          <EyebrowLabel color="#b5453a">
            STOP {stop.order} VAN {trail.stops.length} · JE BENT ER
          </EyebrowLabel>
          <div
            style={{
              font: "400 27px/1.05 'DM Serif Display'",
              color: "#283a5e",
              marginTop: 6,
            }}
          >
            {poi.name}
          </div>
        </div>

        {/* Grounded story */}
        <p style={{ font: "400 14px/1.6 'DM Sans'", color: "#46413a", margin: 0 }}>
          {story}
        </p>

        {/* Source badges */}
        {distinctSources.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {distinctSources.map((src) => (
              <SourceBadge key={src.name} source={src} />
            ))}
          </div>
        )}

        {/* Raadsel card */}
        <div
          style={{
            background: "#faf6ec",
            border: "1px solid #e0d5bf",
            borderRadius: 15,
            padding: 16,
            marginTop: 2,
          }}
        >
          {/* Card header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 10,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b5453a"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2.8-1.2 1.6M12 17h.01" />
            </svg>
            <span
              style={{
                font: "600 11px/1 'Spline Sans Mono'",
                color: "#b5453a",
                letterSpacing: 1,
              }}
            >
              RAADSEL
            </span>
          </div>

          {/* Question prompt */}
          <p
            style={{
              font: "500 14.5px/1.5 'DM Sans'",
              color: "#211f1b",
              margin: "0 0 14px",
            }}
          >
            {question.prompt}
          </p>

          {/* Hint text if shown */}
          {showHint && question.hint && (
            <p
              style={{
                font: "500 13px/1.5 'DM Sans'",
                color: "#a3781f",
                margin: "0 0 12px",
                padding: "8px 10px",
                background: "#f6efe0",
                borderRadius: 8,
                border: "1px dashed #d9c9a2",
              }}
            >
              Hint: {question.hint}
            </p>
          )}

          {/* Feedback */}
          {feedback && (
            <p
              style={{
                font: "500 13px/1.5 'DM Sans'",
                color: done ? "#5a6a3f" : "#b5453a",
                margin: "0 0 12px",
                padding: "8px 10px",
                background: done ? "#e7eed7" : "#fce8e5",
                borderRadius: 8,
                border: done ? "1px solid #cdd9b3" : "1px solid #f5c6c0",
              }}
            >
              {feedback}
            </p>
          )}

          {/* Revealed answer */}
          {revealedAnswer && (
            <p
              style={{
                font: "500 13px/1.5 'DM Sans'",
                color: "#46413a",
                margin: "0 0 12px",
              }}
            >
              Antwoord: <strong>{revealedAnswer}</strong>
            </p>
          )}

          {/* Answer input row */}
          {!done && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Jouw antwoord"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  border: "1.5px solid #ddd2bd",
                  background: "#fff",
                  padding: "0 14px",
                  font: "500 14px/1 'DM Sans'",
                  color: "#211f1b",
                  outline: "none",
                }}
              />
              <button
                aria-label="Antwoord versturen"
                onClick={() => void handleSubmit()}
                style={{
                  width: 54,
                  height: 48,
                  border: "none",
                  borderRadius: 12,
                  background: "#b5453a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.4"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}

          {/* Hint button + attempt counter */}
          {!done && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 13,
              }}
            >
              <button
                onClick={handleHint}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "#f6efe0",
                  border: "1px dashed #d9c9a2",
                  borderRadius: 10,
                  padding: "9px 12px",
                  font: "600 12px/1 'DM Sans'",
                  color: "#a3781f",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c5912f"
                  strokeWidth="2"
                >
                  <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
                </svg>
                Hint gebruiken
              </button>
              <span
                style={{
                  font: "500 11px/1 'Spline Sans Mono'",
                  color: "#8a7f6d",
                }}
              >
                poging {attempt} van 3
              </span>
            </div>
          )}

          {/* Volgende button (shown when done) */}
          {done && (
            <Button
              variant="primary"
              onClick={arriveAtNextOrFinish}
              style={{ width: "100%", marginTop: 8 }}
            >
              Volgende
            </Button>
          )}
        </div>

        {/* Fact report link */}
        <button
          onClick={() => setReportedFact((v) => !v)}
          style={{
            marginTop: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            background: "transparent",
            border: "none",
            font: "500 12px/1 'DM Sans'",
            color: "#8a7f6d",
            cursor: "pointer",
            padding: 6,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a7f6d"
            strokeWidth="2"
          >
            <path d="M12 8v5M12 16h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          {reportedFact ? "Bedankt voor je melding" : "Klopt dit feit niet? Geef het door"}
        </button>
      </div>
    </PhoneFrame>
  );
}
