import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pointsFor, type SolveRecord } from "../gamification";
import type { Trail } from "../api/types";

const STORAGE_KEY = "tq.quester";

export type Phase = "browse" | "preview" | "navigate" | "stop" | "finish";

export interface QuesterState {
  phase: Phase;
  trail: Trail | undefined;
  currentOrder: number;
  solves: Record<number, SolveRecord>;
  points: number;
}

type Action =
  | { type: "SET_TRAIL"; trail: Trail }
  | { type: "START_WALK" }
  | { type: "ARRIVE" }
  | { type: "RECORD_SOLVE"; order: number; record: SolveRecord }
  | { type: "NEXT_OR_FINISH" }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: QuesterState };

const DEFAULT_STATE: QuesterState = {
  phase: "browse",
  trail: undefined,
  currentOrder: 1,
  solves: {},
  points: 0,
};

function reducer(state: QuesterState, action: Action): QuesterState {
  switch (action.type) {
    case "SET_TRAIL": {
      const firstOrder = action.trail.stops[0]?.order ?? 1;
      return {
        phase: "preview",
        trail: action.trail,
        currentOrder: firstOrder,
        solves: {},
        points: 0,
      };
    }
    case "START_WALK":
      return { ...state, phase: "navigate" };
    case "ARRIVE":
      return { ...state, phase: "stop" };
    case "RECORD_SOLVE": {
      const newSolves = { ...state.solves, [action.order]: action.record };
      const addedPoints = pointsFor(action.record);
      return { ...state, solves: newSolves, points: state.points + addedPoints };
    }
    case "NEXT_OR_FINISH": {
      if (!state.trail) return state;
      const stops = state.trail.stops;
      const currentIdx = stops.findIndex((s) => s.order === state.currentOrder);
      const nextStop = stops[currentIdx + 1];
      if (nextStop) {
        return { ...state, phase: "navigate", currentOrder: nextStop.order };
      }
      return { ...state, phase: "finish" };
    }
    case "RESET":
      return { ...DEFAULT_STATE };
    case "HYDRATE":
      return action.state;
    default:
      return state;
  }
}

interface QuesterContextValue {
  state: QuesterState;
  setTrail: (trail: Trail) => void;
  startWalk: () => void;
  arrive: () => void;
  recordSolve: (order: number, record: SolveRecord) => void;
  nextOrFinish: () => void;
  reset: () => void;
}

const QuesterContext = createContext<QuesterContextValue | null>(null);

export function QuesterProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const isFirstRender = useRef(true);
  const hasMounted = useRef(false);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const parsed = JSON.parse(raw) as QuesterState;
        dispatch({ type: "HYDRATE", state: parsed });
      } catch {
        // ignore corrupt data
      }
    });
    hasMounted.current = true;
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on state changes, skip the very first render
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value: QuesterContextValue = {
    state,
    setTrail: (trail: Trail) => dispatch({ type: "SET_TRAIL", trail }),
    startWalk: () => dispatch({ type: "START_WALK" }),
    arrive: () => dispatch({ type: "ARRIVE" }),
    recordSolve: (order: number, record: SolveRecord) =>
      dispatch({ type: "RECORD_SOLVE", order, record }),
    nextOrFinish: () => dispatch({ type: "NEXT_OR_FINISH" }),
    reset: () => dispatch({ type: "RESET" }),
  };

  return (
    <QuesterContext.Provider value={value}>{children}</QuesterContext.Provider>
  );
}

export function useQuester(): QuesterContextValue {
  const ctx = useContext(QuesterContext);
  if (!ctx) {
    throw new Error("useQuester must be used within a QuesterProvider");
  }
  return ctx;
}
