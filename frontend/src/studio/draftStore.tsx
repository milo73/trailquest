import { createContext, useContext, useMemo, useState } from "react";
import { createDraft as apiCreate, createCustomStop, deleteDraft as apiDeleteDraft, getDraft, updateDraft, updateStopContent, generateStopContent as apiGenerateStopContent } from "../api/drafts";
import type { CustomStopRequest, DraftCreate, DraftStop, DraftTrail, POI, StopContentUpdate, StopGenerateRequest, StopGenerateResult } from "../api/types";

const STORAGE_KEY = "tq.studio.draft";
const ACTIVE_KEY = "tq.studio.activeStop";

interface DraftApi {
  draft?: DraftTrail;
  activeStopOrder?: number;
  saving: boolean;
  createDraft: (req: DraftCreate) => Promise<DraftTrail>;
  loadDraft: (id: string) => Promise<void>;
  addStop: (poi: POI) => Promise<void>;
  removeStop: (order: number) => Promise<void>;
  reorder: (order: number, dir: "up" | "down") => Promise<void>;
  setActiveStop: (order: number) => void;
  saveStopContent: (order: number, content: StopContentUpdate) => Promise<void>;
  generateStopContent: (order: number, body: StopGenerateRequest) => Promise<StopGenerateResult>;
  renameDraft: (title: string) => Promise<void>;
  addCustomStop: (body: CustomStopRequest) => Promise<void>;
  removeDraft: (id: string) => Promise<void>;
}

const Ctx = createContext<DraftApi | null>(null);

function renumber(stops: DraftStop[]): DraftStop[] {
  return stops.map((s, i) => ({ ...s, order: i + 1 }));
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<DraftTrail | undefined>(undefined);
  const [activeStopOrder, setActiveStopOrder] = useState<number | undefined>(() => {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v != null ? Number(v) : undefined;
  });
  const [saving, setSaving] = useState(false);

  const api = useMemo<DraftApi>(() => {
    // Persist the new stop order to the server; replace local draft with the
    // authoritative copy (recomputed distance/duration/attributions).
    async function save(next: DraftTrail) {
      setDraft(next); // optimistic
      setSaving(true);
      try {
        const saved = await updateDraft(next.id, { stop_poi_ids: next.stops.map((s) => s.poi.id) });
        setDraft(saved);
      } finally {
        setSaving(false);
      }
    }
    return {
      draft,
      activeStopOrder,
      saving,
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
        const next = { ...draft, stops: renumber([...draft.stops, { id: "", order: 0, poi, questions: [] }]) };
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
      setActiveStop: (order) => {
        setActiveStopOrder(order);
        localStorage.setItem(ACTIVE_KEY, String(order));
      },
      saveStopContent: async (order, content) => {
        if (!draft) return;
        setSaving(true);
        try {
          const saved = await updateStopContent(draft.id, order, content);
          setDraft(saved);
        } finally {
          setSaving(false);
        }
      },
      generateStopContent: async (order, body) => {
        if (!draft) throw new Error("generateStopContent: no active draft");
        return apiGenerateStopContent(draft.id, order, body);
      },
      renameDraft: async (title) => {
        if (!draft) return;
        setSaving(true);
        try {
          const saved = await updateDraft(draft.id, { title });
          setDraft(saved);
        } finally {
          setSaving(false);
        }
      },
      addCustomStop: async (body) => {
        if (!draft) return;
        setSaving(true);
        try {
          const saved = await createCustomStop(draft.id, body);
          setDraft(saved);
        } finally {
          setSaving(false);
        }
      },
      removeDraft: async (id) => {
        await apiDeleteDraft(id);
        if (draft?.id === id) {
          setDraft(undefined);
          localStorage.removeItem(ACTIVE_KEY);
        }
        // Always drop the persisted draft id when it points at the deleted
        // draft — otherwise a reload tries to load a 404.
        if (localStorage.getItem(STORAGE_KEY) === id) {
          localStorage.removeItem(STORAGE_KEY);
        }
      },
    };
  }, [draft, activeStopOrder, saving]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDraft(): DraftApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
}
