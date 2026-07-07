import { apiFetch } from "./client";
import type { AnswerRequest, AnswerResult, Trail } from "./types";

export const listTrails = () => apiFetch<Trail[]>("/trails");
export const getTrail = (id: string) => apiFetch<Trail>(`/trails/${id}`);
export const submitAnswer = (id: string, req: AnswerRequest) =>
  apiFetch<AnswerResult>(`/trails/${id}/answer`, { method: "POST", body: JSON.stringify(req) });
