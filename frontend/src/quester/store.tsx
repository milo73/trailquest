import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Trail, TrailRequest } from "../api/types";
import { pointsFor, type SolveRecord } from "./gamification";

export type Phase = "configure" | "preview" | "navigate" | "stop" | "finish";

export interface QuesterState {
  phase: Phase;
  config: TrailRequest;
  trail?: Trail;
  currentOrder: number;
  solves: Record<number, SolveRecord>;
  points: number;
}

const STORAGE_KEY = "tq.quester";
const DEFAULT_STATE: QuesterState = {
  phase: "configure",
  config: { start: { lat: 52.3812, lon: 4.6361 }, distance_km: 5, theme: "historical" },
  currentOrder: 1,
  solves: {},
  points: 0,
};

function load(): QuesterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...(JSON.parse(raw) as QuesterState) };
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_STATE;
}

interface QuesterApi {
  state: QuesterState;
  setConfig: (partial: Partial<TrailRequest>) => void;
  setTrail: (trail: Trail) => void;
  goToStop: (order: number) => void;
  recordSolve: (order: number, record: SolveRecord) => void;
  arriveAtNextOrFinish: () => void;
  reset: () => void;
}

const Ctx = createContext<QuesterApi | null>(null);

export function QuesterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuesterState>(load);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const api = useMemo<QuesterApi>(() => {
    const orders = () => (state.trail?.stops.map((s) => s.order) ?? []);
    return {
      state,
      setConfig: (partial) => setState((s) => ({ ...s, config: { ...s.config, ...partial } })),
      setTrail: (trail) =>
        setState((s) => ({ ...s, trail, phase: "preview", currentOrder: trail.stops[0]?.order ?? 1, solves: {}, points: 0 })),
      goToStop: (order) => setState((s) => ({ ...s, phase: "stop", currentOrder: order })),
      recordSolve: (order, record) =>
        setState((s) => ({
          ...s,
          solves: { ...s.solves, [order]: record },
          points: s.points + pointsFor(record),
        })),
      arriveAtNextOrFinish: () =>
        setState((s) => {
          const all = s.trail?.stops.map((st) => st.order) ?? [];
          const idx = all.indexOf(s.currentOrder);
          const next = all[idx + 1];
          return next === undefined
            ? { ...s, phase: "finish" }
            : { ...s, phase: "navigate", currentOrder: next };
        }),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState({ ...DEFAULT_STATE });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useQuester(): QuesterApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuester must be used within QuesterProvider");
  return ctx;
}
