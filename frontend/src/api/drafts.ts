import { apiFetch } from "./client";
import type {
  DraftCreate,
  DraftTrail,
  DraftUpdate,
  StopContentUpdate,
  StopGenerateRequest,
  StopGenerateResult,
} from "./types";

export const createDraft = (req: DraftCreate) =>
  apiFetch<DraftTrail>("/drafts", { method: "POST", body: JSON.stringify(req) });

export const getDraft = (id: string) => apiFetch<DraftTrail>(`/drafts/${id}`);

export const listDrafts = () => apiFetch<DraftTrail[]>("/drafts");

export const updateDraft = (id: string, req: DraftUpdate) =>
  apiFetch<DraftTrail>(`/drafts/${id}`, { method: "PUT", body: JSON.stringify(req) });

export const updateStopContent = (draftId: string, order: number, body: StopContentUpdate) =>
  apiFetch<DraftTrail>(`/drafts/${draftId}/stops/${order}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const generateStopContent = (draftId: string, order: number, body: StopGenerateRequest) =>
  apiFetch<StopGenerateResult>(`/drafts/${draftId}/stops/${order}/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
