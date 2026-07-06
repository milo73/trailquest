import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Question, QuestionType } from "../../api/types";
import { StudioChrome } from "../StudioChrome";
import { SourceBadge } from "../../design-system/primitives/SourceBadge";
import { Button } from "../../design-system/primitives/Button";
import { PhoneFrame } from "../../design-system/primitives/PhoneFrame";
import { TileMap } from "../../design-system/primitives";
import { useDraft } from "../draftStore";

/** Pure helper: only Type A and D can gate the next stop. */
export function canGate(type: QuestionType): boolean {
  return type === "A" || type === "D";
}

const TYPE_LABELS: Record<QuestionType, string> = {
  A: "A · Datagebonden",
  B: "B · Observeren",
  C: "C · Reflectie",
  D: "D · Raadsel (feit)",
};

const TYPE_SUBLABEL: Partial<Record<QuestionType, string>> = {
  B: "honor",
  C: "open",
};

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

const TONES = [
  { value: "speels", label: "Speels" },
  { value: "zakelijk", label: "Zakelijk" },
  { value: "kindvriendelijk", label: "Kindvriendelijk" },
  { value: "verhalend", label: "Verhalend" },
];

/** A mutable draft of a single question (mirrors Question but answer/hint always strings) */
interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  answer: string;
  hint: string;
  gates: boolean;
}

function blankQuestion(): DraftQuestion {
  return { type: "A", prompt: "", answer: "", hint: "", gates: true };
}

function seedDraftQuestions(questions: Question[] | null | undefined): DraftQuestion[] {
  if (!questions || questions.length === 0) return [blankQuestion()];
  return questions.map((q) => ({
    type: q.type as QuestionType,
    prompt: q.prompt,
    answer: q.answer ?? "",
    hint: q.hint ?? "",
    gates: Boolean(q.gates),
  }));
}

function buildQuestion(dq: DraftQuestion): Question | null {
  const gating = canGate(dq.type);
  if (gating && dq.answer.trim() === "") return null; // validation block
  return {
    type: dq.type,
    prompt: dq.prompt,
    answer: gating ? dq.answer : null,
    hint: dq.hint || null,
    gates: gating && dq.gates,
  };
}

export function StopEditor() {
  const navigate = useNavigate();
  const { draft, activeStopOrder, setActiveStop, loadDraft, saving, saveStopContent, generateStopContent } = useDraft();

  // Mount-load: restore draft from localStorage on deep-link / reload
  useEffect(() => {
    if (!draft) {
      const savedId = localStorage.getItem("tq.studio.draft");
      if (savedId) loadDraft(savedId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pagination
  const orders = draft?.stops.map((s) => s.order) ?? [];
  const idx = activeStopOrder !== undefined ? orders.indexOf(activeStopOrder) : -1;

  const activeStop = draft?.stops.find((s) => s.order === activeStopOrder);
  const hasStop = activeStop !== undefined;

  // Derive from activeStop only; these are only used inside the hasStop branch.
  const activePoi = activeStop?.poi;
  const sourceStory = activeStop?.story ?? "";

  // Feiten: track which facts are included (all on by default).
  // Seed from activePoi so switching to a real POI with different fact keys
  // starts with all checkboxes checked rather than all unchecked.
  const [includedFacts, setIncludedFacts] = useState<Record<string, boolean>>(
    Object.fromEntries((activePoi?.facts ?? []).map((f) => [f.key, true]))
  );

  useEffect(() => {
    setIncludedFacts(Object.fromEntries((activePoi?.facts ?? []).map((f) => [f.key, true])));
  }, [activePoi?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verhaal state
  const [story, setStory] = useState(sourceStory);

  // Multi-question state
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    seedDraftQuestions(activeStop?.questions)
  );
  const [primaryIndex, setPrimaryIndex] = useState<number>(activeStop?.primary_question_index ?? 0);
  const [answerErrors, setAnswerErrors] = useState<boolean[]>([]);

  const [tone, setTone] = useState("speels");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    setStory(sourceStory);
    const seeded = seedDraftQuestions(activeStop?.questions);
    setQuestions(seeded);
    setPrimaryIndex(activeStop?.primary_question_index ?? 0);
    setAnswerErrors([]);
  }, [activeStop?.order, activePoi?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => {
      const next = prev.map((q, i) => (i === index ? { ...q, ...patch } : q));
      return next;
    });
  }

  function handleTypeChange(index: number, newType: QuestionType) {
    const gates = canGate(newType);
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, type: newType, gates: gates ? q.gates : false } : q
      )
    );
    // If this row is the primary and the new type can't gate, move primary to first gating row
    setPrimaryIndex((prev) => {
      if (prev === index && !gates) {
        const firstGating = questions.findIndex((q, i) => i !== index && canGate(q.type));
        return firstGating >= 0 ? firstGating : prev;
      }
      return prev;
    });
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
    setAnswerErrors((prev) => [...prev, false]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setPrimaryIndex((prev) => {
      if (prev === index) {
        // deleted the primary; pick the first gating row if any, else 0
        const remaining = questions.filter((_, i) => i !== index);
        const firstGating = remaining.findIndex((q) => canGate(q.type));
        return firstGating >= 0 ? firstGating : 0;
      }
      if (prev > index) return prev - 1;
      return prev;
    });
    setAnswerErrors((prev) => prev.filter((_, i) => i !== index));
  }

  // Build and validate the full list, returning null if any primary answer is missing
  function buildAllQuestions(): Question[] | null {
    const newErrors = questions.map(() => false);
    let valid = true;
    const built = questions.map((dq, i) => {
      const q = buildQuestion(dq);
      if (q === null && i === primaryIndex) {
        newErrors[i] = true;
        valid = false;
        return null;
      }
      if (q === null) {
        // non-primary with missing answer: build it as non-gating
        return {
          type: dq.type,
          prompt: dq.prompt,
          answer: null,
          hint: dq.hint || null,
          gates: false,
        } as Question;
      }
      return q;
    });
    setAnswerErrors(newErrors);
    if (!valid) return null;
    return built as Question[];
  }

  async function saveAllQuestions(qs: DraftQuestion[], primIdx: number) {
    if (activeStopOrder === undefined) return;
    const newErrors = qs.map(() => false);
    let valid = true;
    const built = qs.map((dq, i) => {
      const q = buildQuestion(dq);
      if (q === null && i === primIdx) {
        newErrors[i] = true;
        valid = false;
        return null;
      }
      if (q === null) {
        return {
          type: dq.type,
          prompt: dq.prompt,
          answer: null,
          hint: dq.hint || null,
          gates: false,
        } as Question;
      }
      return q;
    });
    setAnswerErrors(newErrors);
    if (!valid) return;
    await saveStopContent(activeStopOrder, {
      questions: built as Question[],
      primary_question_index: primIdx,
    });
  }

  async function handleSave() {
    if (activeStopOrder === undefined) return;
    const built = buildAllQuestions();
    if (built === null) return;
    await saveStopContent(activeStopOrder, {
      questions: built,
      primary_question_index: primaryIndex,
    });
  }

  async function handleRegenerate() {
    if (activeStopOrder === undefined) return;
    const factKeys = (activePoi?.facts ?? []).filter((f) => includedFacts[f.key] ?? true).map((f) => f.key);
    setRegenError(false);
    setDegraded(false);
    setRegenerating(true);
    try {
      const result = await generateStopContent(activeStopOrder, { fact_keys: factKeys, tone });
      setDegraded(Boolean(result.degraded));
      setStory(result.story);
      const seeded = seedDraftQuestions(result.questions);
      setQuestions(seeded);
      const newPrimary = result.primary_question_index ?? 0;
      setPrimaryIndex(newPrimary);
      setAnswerErrors([]);
      await saveStopContent(activeStopOrder, {
        story: result.story,
        questions: result.questions,
        primary_question_index: newPrimary,
      });
    } catch {
      setRegenError(true);
    } finally {
      setRegenerating(false);
    }
  }

  async function saveStory() {
    if (activeStopOrder === undefined) return;
    await saveStopContent(activeStopOrder, { story });
  }

  const mapStops = draft
    ? [
        { order: 0, label: "S", lat: draft.start.lat, lon: draft.start.lon },
        ...draft.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
      ]
    : [];

  // For the preview panel, show the primary question's prompt
  const primaryQ = questions[primaryIndex] ?? questions[0];

  return (
    <StudioChrome breadcrumb="stop-editor">
      <div style={{ display: "flex", height: 782 }}>
        {/* ── Left context sidebar ── */}
        <div
          style={{
            width: 248,
            flexShrink: 0,
            background: "#faf6ec",
            borderRight: "1px solid #e6dcc6",
            padding: "20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Return to route */}
          <button
            onClick={() => navigate("/studio/route")}
            style={{
              alignSelf: "flex-start",
              font: "500 12px/1 var(--tq-sans)",
              color: "#283a5e",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Terug naar route
          </button>

          {/* Stop navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              aria-label="Vorige stop"
              onClick={() => idx > 0 && setActiveStop(orders[idx - 1])}
              disabled={idx <= 0}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "1px solid #e0d5bf",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: idx <= 0 ? "not-allowed" : "pointer",
                opacity: idx <= 0 ? 0.5 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2.2">
                <path d="M15 6 9 12 15 18" />
              </svg>
            </button>
            <span style={{ font: "600 11px/1 var(--tq-mono)", color: "#8a7f6d", letterSpacing: 1 }}>
              STOP {idx >= 0 ? idx + 1 : "—"} / {orders.length || "—"}
            </span>
            <button
              aria-label="Volgende stop"
              onClick={() => idx >= 0 && idx < orders.length - 1 && setActiveStop(orders[idx + 1])}
              disabled={idx < 0 || idx >= orders.length - 1}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "1px solid #e0d5bf",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: (idx < 0 || idx >= orders.length - 1) ? "not-allowed" : "pointer",
                opacity: (idx < 0 || idx >= orders.length - 1) ? 0.5 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2.2">
                <path d="M9 6 15 12 9 18" />
              </svg>
            </button>
          </div>

          {/* Mini map */}
          <div
            style={{
              position: "relative",
              height: 128,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #e0d5bf",
            }}
          >
            <TileMap stops={mapStops} routeGeometry={draft?.route_geometry} activeOrder={activeStop?.order} />
          </div>

          {/* POI info */}
          {hasStop && (
            <div>
              <div style={{ font: "400 22px/1.1 var(--tq-serif)", color: "#283a5e" }}>{activePoi!.name}</div>
              <div style={{ font: "500 12px/1.4 var(--tq-sans)", color: "#8a7f6d", marginTop: 7 }}>
                {draft?.city}
              </div>
              <div style={{ font: "500 11px/1 var(--tq-mono)", color: "#a99e88", marginTop: 6 }}>
                {activeStop!.poi.location.lat.toFixed(4)}° N, {activeStop!.poi.location.lon.toFixed(4)}° O
              </div>
            </div>
          )}

          {/* Status */}
          {hasStop && (
          <div
            style={{
              borderTop: "1px solid #e6dcc6",
              paddingTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <div style={{ font: "600 10px/1 var(--tq-mono)", color: "#8a7f6d", letterSpacing: 1 }}>STATUS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 12px/1 var(--tq-sans)", color: "#6f8a4f" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4">
                <path d="M5 12l4 4 10-10" />
              </svg>
              Feiten gegrond ({activePoi!.facts.length} bronnen)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 12px/1 var(--tq-sans)", color: "#6f8a4f" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.4">
                <path d="M5 12l4 4 10-10" />
              </svg>
              {primaryQ && canGate(primaryQ.type)
                ? `Primair kan gaten (Type ${primaryQ.type})`
                : `Primair gaten uit (Type ${primaryQ?.type ?? "?"})`}
            </div>
          </div>
          )}
        </div>

        {/* ── Center editor ── */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "22px 26px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            background: "#fdfbf6",
          }}
        >
          {!hasStop ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                font: "500 15px/1.5 var(--tq-sans)",
                color: "#8a7f6d",
                textAlign: "center",
              }}
            >
              Geen stop geselecteerd — kies een stop in de route-editor
            </div>
          ) : (
            <>
              {/* FEITEN — locked */}
              <div
                style={{
                  border: "1px solid #d4dae6",
                  borderRadius: 14,
                  background: "#f1f3f8",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "13px 17px",
                    background: "#e7ebf3",
                    borderBottom: "1px solid #d4dae6",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <span style={{ font: "700 12px/1 var(--tq-mono)", color: "#283a5e", letterSpacing: 1 }}>
                    GRONDWAARHEID · VERGRENDELD
                  </span>
                  <span style={{ marginLeft: "auto", font: "500 11px/1 var(--tq-sans)", color: "#7d8aa6" }}>
                    Uit bronnen — niet vrij bewerkbaar
                  </span>
                </div>
                <div style={{ padding: "8px 17px 14px" }}>
                  {activePoi!.facts.map((fact, i) => {
                    const isLast = i === activePoi!.facts.length - 1;
                    // Default to true for any fact key not yet in the map (e.g. during
                    // the brief window before the useEffect re-seeds from the new POI).
                    const included = includedFacts[fact.key] ?? true;
                    return (
                      <div
                        key={fact.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 0",
                          borderBottom: isLast ? "none" : "1px solid #e1e5ee",
                        }}
                      >
                        {/* Include/exclude checkbox */}
                        <label
                          aria-label={`${fact.value} opnemen`}
                          style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(e) =>
                              setIncludedFacts((prev) => ({ ...prev, [fact.key]: e.target.checked }))
                            }
                            style={{ display: "none" }}
                          />
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              background: included ? "#283a5e" : "#c9ced8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            {included && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                <path d="M5 12l4 4 10-10" />
                              </svg>
                            )}
                          </span>
                        </label>

                        {/* Fact text — NOT editable */}
                        <span
                          style={{
                            flex: 1,
                            font: "600 14px/1.3 var(--tq-sans)",
                            color: included ? "#211f1b" : "#8a8576",
                          }}
                        >
                          {fact.value}
                        </span>

                        <SourceBadge source={fact.source} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* VERHAAL — editable */}
              <div
                style={{
                  border: "1.5px solid #b5453a",
                  borderRadius: 14,
                  background: "#fff",
                  overflow: "hidden",
                  boxShadow: "0 0 0 4px rgba(181,69,58,.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "13px 17px",
                    borderBottom: "1px solid #f0e6d4",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  <span style={{ font: "700 12px/1 var(--tq-mono)", color: "#963a30", letterSpacing: 1 }}>
                    VERHAAL · BEWERKBAAR
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginLeft: 8,
                      font: "600 10px/1 var(--tq-sans)",
                      color: "#8a7f6d",
                      background: "#f6efe0",
                      borderRadius: 20,
                      padding: "4px 9px",
                    }}
                  >
                    AI-gegenereerd
                  </span>
                  {/* Save status */}
                  <span
                    style={{
                      marginLeft: 8,
                      font: "500 11px/1 var(--tq-sans)",
                      color: saving ? "#8a7f6d" : "#6f8a4f",
                    }}
                  >
                    {saving ? "Bezig…" : "Opgeslagen ✓"}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 7, alignItems: "center" }}>
                    <select
                      aria-label="Toon"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      style={{
                        font: "500 11px/1 var(--tq-sans)",
                        color: "#36322b",
                        border: "1px solid #e6dcc6",
                        borderRadius: 7,
                        padding: "6px 8px",
                        background: "#fdfbf6",
                        cursor: "pointer",
                      }}
                    >
                      {TONES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      style={{
                        height: "auto",
                        padding: "6px 10px",
                        borderRadius: 7,
                        fontSize: 11,
                        gap: 5,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
                      </svg>
                      {regenerating ? "Genereren…" : "Regenereer"}
                    </Button>
                  </div>
                </div>
                {regenError && (
                  <div
                    style={{
                      padding: "8px 17px",
                      font: "500 12px/1.3 var(--tq-sans)",
                      color: "#b5453a",
                      background: "#fff8f7",
                      borderBottom: "1px solid #f0e6d4",
                    }}
                  >
                    Genereren mislukt of duurde te lang — probeer opnieuw.
                  </div>
                )}
                {degraded && !regenError && (
                  <div
                    role="status"
                    style={{
                      padding: "8px 17px",
                      font: "500 12px/1.3 var(--tq-sans)",
                      color: "#8a6d1f",
                      background: "#fdf7e6",
                      borderBottom: "1px solid #f0e6d4",
                    }}
                  >
                    Basis-samenvatting — de AI-provider was niet beschikbaar; dit is een feiten-echo,
                    geen echt gegenereerd verhaal.
                  </div>
                )}
                <div style={{ padding: "16px 18px" }}>
                  <textarea
                    aria-label="Verhaal"
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    onBlur={saveStory}
                    rows={5}
                    style={{
                      width: "100%",
                      font: "400 15px/1.65 var(--tq-sans)",
                      color: "#36322b",
                      border: "none",
                      outline: "none",
                      resize: "vertical",
                      background: "transparent",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 18px",
                    borderTop: "1px solid #f0e6d4",
                    background: "#fdfbf6",
                  }}
                >
                  <span style={{ font: "500 11px/1 var(--tq-mono)", color: "#8a7f6d" }}>
                    {countWords(story)} woorden
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      font: "500 11px/1 var(--tq-sans)",
                      color: "#6f8a4f",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6f8a4f" strokeWidth="2.2">
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                    RAG: gebruikt uitsluitend de feiten hierboven — verzint niets
                  </span>
                </div>
              </div>

              {/* OPDRACHTEN — multi-question list */}
              <div
                style={{
                  border: "1px solid #e6dcc6",
                  borderRadius: 14,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "13px 17px",
                    borderBottom: "1px solid #f0e6d4",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2.8-1.2 1.6M12 17h.01" />
                  </svg>
                  <span style={{ font: "700 12px/1 var(--tq-mono)", color: "#283a5e", letterSpacing: 1 }}>
                    OPDRACHTEN
                  </span>
                  <span style={{ font: "500 11px/1 var(--tq-sans)", color: "#8a7f6d", marginLeft: 4 }}>
                    {questions.length} vraag{questions.length !== 1 ? "en" : ""}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={handleSave}
                    style={{
                      marginLeft: "auto",
                      height: "auto",
                      padding: "6px 10px",
                      borderRadius: 7,
                      fontSize: 11,
                    }}
                  >
                    Opslaan
                  </Button>
                </div>

                <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {questions.map((dq, qIdx) => {
                    const gating = canGate(dq.type);
                    const isPrimary = qIdx === primaryIndex;
                    const hasAnswerError = answerErrors[qIdx] ?? false;

                    return (
                      <div
                        key={qIdx}
                        style={{
                          border: isPrimary ? "1.5px solid #283a5e" : "1px solid #e6dcc6",
                          borderRadius: 11,
                          background: isPrimary ? "#f7f9fd" : "#fdfbf6",
                          padding: 14,
                          display: "flex",
                          gap: 14,
                          alignItems: "flex-start",
                          position: "relative",
                        }}
                      >
                        {/* Primary radio + question number */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 2, flexShrink: 0 }}>
                          <span style={{ font: "600 10px/1 var(--tq-mono)", color: "#8a7f6d", letterSpacing: 0.5 }}>
                            #{qIdx + 1}
                          </span>
                          <label
                            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: gating ? "pointer" : "not-allowed", opacity: gating ? 1 : 0.4 }}
                            title={gating ? "Stel in als primaire poortvraag" : "Alleen type A of D kan een poortvraag zijn"}
                          >
                            <input
                              type="radio"
                              aria-label={`Primair (poort) vraag ${qIdx + 1}`}
                              name="primary-question"
                              checked={isPrimary}
                              disabled={!gating}
                              onChange={() => {
                                if (gating) setPrimaryIndex(qIdx);
                              }}
                              style={{ cursor: gating ? "pointer" : "not-allowed" }}
                            />
                            <span style={{ font: "500 9px/1 var(--tq-sans)", color: isPrimary ? "#283a5e" : "#8a7f6d", textAlign: "center", maxWidth: 36 }}>
                              primair (poort)
                            </span>
                          </label>
                        </div>

                        {/* Question content */}
                        <div style={{ flex: 1, display: "flex", gap: 14, alignItems: "flex-start" }}>
                          {/* Left: prompt + answer + hint */}
                          <div style={{ flex: 1 }}>
                            <input
                              aria-label="Vraagprompt"
                              value={dq.prompt}
                              onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                              onBlur={() => saveAllQuestions(questions, primaryIndex)}
                              placeholder="Voer de vraag in…"
                              style={{
                                width: "100%",
                                font: "500 14px/1.5 var(--tq-sans)",
                                color: "#36322b",
                                border: "1px solid #e6dcc6",
                                borderRadius: 8,
                                padding: "7px 10px",
                                background: "#fdfbf6",
                                boxSizing: "border-box",
                                marginBottom: 10,
                              }}
                            />
                            {gating && (
                              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                                <span style={{ font: "600 11px/1 var(--tq-mono)", color: "#8a7f6d", flexShrink: 0 }}>ANTWOORD</span>
                                <input
                                  aria-label="Antwoord"
                                  value={dq.answer}
                                  onChange={(e) => updateQuestion(qIdx, { answer: e.target.value })}
                                  onBlur={() => saveAllQuestions(questions, primaryIndex)}
                                  style={{
                                    font: "700 13px/1 var(--tq-sans)",
                                    color: "#211f1b",
                                    background: "#f1f3f8",
                                    border: "1px solid #d4dae6",
                                    borderRadius: 8,
                                    padding: "7px 11px",
                                  }}
                                />
                                <span style={{ font: "500 10px/1.3 var(--tq-sans)", color: "#8a7f6d" }}>
                                  afgeleid uit data
                                </span>
                              </div>
                            )}
                            {hasAnswerError && (
                              <div style={{ font: "500 11px/1.3 var(--tq-sans)", color: "#b5453a", marginBottom: 6 }}>
                                Antwoord verplicht voor een poortvraag
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <span style={{ font: "600 11px/1 var(--tq-mono)", color: "#8a7f6d", flexShrink: 0 }}>HINT</span>
                              <input
                                aria-label="Hint"
                                value={dq.hint}
                                onChange={(e) => updateQuestion(qIdx, { hint: e.target.value })}
                                onBlur={() => saveAllQuestions(questions, primaryIndex)}
                                style={{
                                  flex: 1,
                                  font: "500 12px/1 var(--tq-sans)",
                                  color: "#36322b",
                                  background: "#fdfbf6",
                                  border: "1px solid #e6dcc6",
                                  borderRadius: 8,
                                  padding: "6px 9px",
                                }}
                              />
                            </div>
                          </div>

                          {/* Right: type select */}
                          <div
                            style={{
                              width: 190,
                              flexShrink: 0,
                              background: "#fdfbf6",
                              border: "1px solid #e6dcc6",
                              borderRadius: 11,
                              padding: 11,
                            }}
                          >
                            <label
                              htmlFor={`vraagtype-select-${qIdx}`}
                              style={{
                                display: "block",
                                font: "600 10px/1 var(--tq-mono)",
                                color: "#8a7f6d",
                                letterSpacing: 1,
                                marginBottom: 7,
                              }}
                            >
                              VRAAGTYPE
                            </label>
                            <select
                              id={`vraagtype-select-${qIdx}`}
                              aria-label={`Vraagtype ${qIdx + 1}`}
                              value={dq.type}
                              onChange={(e) => {
                                const newType = e.target.value as QuestionType;
                                handleTypeChange(qIdx, newType);
                                // immediate save with new type applied
                                const nextQuestions = questions.map((q, i) =>
                                  i === qIdx ? { ...q, type: newType, gates: canGate(newType) ? q.gates : false } : q
                                );
                                let nextPrimary = primaryIndex;
                                if (primaryIndex === qIdx && !canGate(newType)) {
                                  const firstGating = nextQuestions.findIndex((q, i) => i !== qIdx && canGate(q.type));
                                  nextPrimary = firstGating >= 0 ? firstGating : primaryIndex;
                                }
                                void saveAllQuestions(nextQuestions, nextPrimary);
                              }}
                              style={{
                                width: "100%",
                                font: "600 12px/1 var(--tq-sans)",
                                color: "#211f1b",
                                border: "1.5px solid #9fb87f",
                                borderRadius: 8,
                                padding: "7px 9px",
                                background: "#e7eed7",
                                cursor: "pointer",
                              }}
                            >
                              {(["A", "B", "C", "D"] as QuestionType[]).map((t) => (
                                <option key={t} value={t}>
                                  {TYPE_LABELS[t]}
                                  {TYPE_SUBLABEL[t] ? ` · ${TYPE_SUBLABEL[t]}` : ""}
                                </option>
                              ))}
                            </select>

                            {/* Gate toggle — always shown for all questions; primary is locked-on */}
                            <div
                              style={{
                                marginTop: 9,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: (gating && (isPrimary || dq.gates)) ? "#e7eed7" : "#f3f3f3",
                                borderRadius: 8,
                                padding: "7px 9px",
                                opacity: gating ? 1 : 0.5,
                              }}
                            >
                              <input
                                role="switch"
                                type="checkbox"
                                aria-label="Mag volgende stop gaten"
                                checked={gating && (isPrimary || dq.gates)}
                                disabled={!gating || isPrimary}
                                onChange={(e) => {
                                  if (!gating || isPrimary) return;
                                  const checked = e.target.checked;
                                  updateQuestion(qIdx, { gates: checked });
                                  const nextQuestions = questions.map((q, i) =>
                                    i === qIdx ? { ...q, gates: checked } : q
                                  );
                                  void saveAllQuestions(nextQuestions, primaryIndex);
                                }}
                                style={{ width: 28, height: 16, cursor: (!gating || isPrimary) ? "not-allowed" : "pointer" }}
                              />
                              <span style={{ font: "600 10px/1.2 var(--tq-sans)", color: (gating && (isPrimary || dq.gates)) ? "#3a5a2f" : "#8a7f6d" }}>
                                {isPrimary ? "Primair (poort)" : "Mag volgende stop gaten"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Remove button */}
                        <button
                          aria-label={`Vraag ${qIdx + 1} verwijderen`}
                          onClick={() => removeQuestion(qIdx)}
                          disabled={questions.length <= 1}
                          style={{
                            flexShrink: 0,
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            border: "1px solid #e6dcc6",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: questions.length <= 1 ? "not-allowed" : "pointer",
                            opacity: questions.length <= 1 ? 0.35 : 1,
                            padding: 0,
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b5453a" strokeWidth="2.2">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}

                  {/* Add question button */}
                  <button
                    onClick={addQuestion}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      alignSelf: "flex-start",
                      font: "600 12px/1 var(--tq-sans)",
                      color: "#283a5e",
                      background: "#f0f3fa",
                      border: "1px dashed #b0bcd4",
                      borderRadius: 8,
                      padding: "8px 14px",
                      cursor: "pointer",
                    }}
                  >
                    ➕ Vraag toevoegen
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right player preview ── */}
        <div
          style={{
            width: 318,
            flexShrink: 0,
            background: "#efe7d4",
            borderLeft: "1px solid #e6dcc6",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283a5e" strokeWidth="2">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            <span style={{ font: "600 11px/1 var(--tq-mono)", color: "#8a7f6d", letterSpacing: 1 }}>
              VOORVERTONING · SPELER
            </span>
          </div>

          <PhoneFrame>
            <div style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
              {hasStop && (
              <div>
                <div
                  style={{
                    font: "600 9px/1 var(--tq-mono)",
                    color: "#b5453a",
                    letterSpacing: 1.5,
                  }}
                >
                  STOP {activeStop!.order} · JE BENT ER
                </div>
                <div
                  style={{
                    font: "400 21px/1.05 var(--tq-serif)",
                    color: "#283a5e",
                    marginTop: 5,
                  }}
                >
                  {activePoi!.name}
                </div>
              </div>
              )}
              <p
                style={{
                  font: "400 11.5px/1.55 var(--tq-sans)",
                  color: "#46413a",
                  margin: 0,
                }}
              >
                {story.length > 120 ? story.slice(0, 117) + "…" : story}
              </p>
              <div
                style={{
                  background: "#faf6ec",
                  border: "1px solid #e0d5bf",
                  borderRadius: 11,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    font: "600 9px/1 var(--tq-mono)",
                    color: "#8a7f6d",
                    letterSpacing: 1,
                    marginBottom: 7,
                  }}
                >
                  RAADSEL
                </div>
                <p
                  style={{
                    font: "500 11.5px/1.45 var(--tq-sans)",
                    color: "#36322b",
                    margin: "0 0 10px",
                  }}
                >
                  {primaryQ?.prompt && primaryQ.prompt.length > 80
                    ? primaryQ.prompt.slice(0, 77) + "…"
                    : (primaryQ?.prompt ?? "")}
                </p>
                <div style={{ display: "flex", gap: 7 }}>
                  <span
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid #ddd2bd",
                      background: "#fff",
                    }}
                  />
                  <span
                    style={{
                      width: 46,
                      height: 34,
                      borderRadius: 8,
                      background: "#b5453a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.4"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </PhoneFrame>

          <div
            style={{
              font: "500 11px/1.5 var(--tq-sans)",
              color: "#8a7f6d",
              textAlign: "center",
            }}
          >
            Zo ziet de speler deze stop — exact zoals onderweg.
          </div>
        </div>
      </div>
    </StudioChrome>
  );
}
