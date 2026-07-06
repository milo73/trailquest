import { apiFetch } from "./client";
import type { AnswerRequest, AnswerResult, Trail, TrailRequest } from "./types";

export const createTrail = (req: TrailRequest) =>
  apiFetch<Trail>("/trails", { method: "POST", body: JSON.stringify(req) });

export const getTrail = (id: string) => apiFetch<Trail>(`/trails/${id}`);

export const submitAnswer = (id: string, req: AnswerRequest) =>
  apiFetch<AnswerResult>(`/trails/${id}/answer`, { method: "POST", body: JSON.stringify(req) });
