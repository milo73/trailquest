import { createContext, useContext, useMemo, useState } from "react";
import { createDraft as apiCreate, getDraft, updateDraft } from "../api/drafts";
import type { DraftCreate, DraftStop, DraftTrail, POI } from "../api/types";

const STORAGE_KEY = "tq.studio.draft";

interface DraftApi {
  draft?: DraftTrail;
  activeStopOrder?: number;
  createDraft: (req: DraftCreate) => Promise<DraftTrail>;
  loadDraft: (id: string) => Promise<void>;
  addStop: (poi: POI) => Promise<void>;
  removeStop: (order: number) => Promise<void>;
  reorder: (order: number, dir: "up" | "down") => Promise<void>;
  setActiveStop: (order: number) => void;
}

const Ctx = createContext<DraftApi | null>(null);

function renumber(stops: DraftStop[]): DraftStop[] {
  return stops.map((s, i) => ({ ...s, order: i + 1 }));
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<DraftTrail | undefined>(undefined);
  const [activeStopOrder, setActiveStopOrder] = useState<number | undefined>(undefined);

  const api = useMemo<DraftApi>(() => {
    // Persist the new stop order to the server; replace local draft with the
    // authoritative copy (recomputed distance/duration/attributions).
    async function save(next: DraftTrail) {
      setDraft(next); // optimistic
      const saved = await updateDraft(next.id, { stop_poi_ids: next.stops.map((s) => s.poi.id) });
      setDraft(saved);
    }
    return {
      draft,
      activeStopOrder,
      createDraft: async (req) => {
        const created = await apiCreate(req);
        setDraft(created);
        localStorage.setItem(STORAGE_KEY, created.id);
        return created;
      },
      loadDraft: async (id) => {
        const loaded = await getDraft(id);
        setDraft(loaded);
        localStorage.setItem(STORAGE_KEY, loaded.id);
      },
      addStop: async (poi) => {
        if (!draft) return;
        const next = { ...draft, stops: renumber([...draft.stops, { order: 0, poi }]) };
        await save(next);
      },
      removeStop: async (order) => {
        if (!draft) return;
        const next = { ...draft, stops: renumber(draft.stops.filter((s) => s.order !== order)) };
        await save(next);
      },
      reorder: async (order, dir) => {
        if (!draft) return;
        const i = draft.stops.findIndex((s) => s.order === order);
        const j = dir === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= draft.stops.length) return;
        const swapped = [...draft.stops];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
        await save({ ...draft, stops: renumber(swapped) });
      },
      setActiveStop: (order) => setActiveStopOrder(order),
    };
  }, [draft, activeStopOrder]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDraft(): DraftApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
}
