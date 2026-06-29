import { apiFetch } from "./client";
import type { DraftCreate, DraftTrail, DraftUpdate } from "./types";

export const createDraft = (req: DraftCreate) =>
  apiFetch<DraftTrail>("/drafts", { method: "POST", body: JSON.stringify(req) });

export const getDraft = (id: string) => apiFetch<DraftTrail>(`/drafts/${id}`);

export const listDrafts = () => apiFetch<DraftTrail[]>("/drafts");

export const updateDraft = (id: string, req: DraftUpdate) =>
  apiFetch<DraftTrail>(`/drafts/${id}`, { method: "PUT", body: JSON.stringify(req) });
