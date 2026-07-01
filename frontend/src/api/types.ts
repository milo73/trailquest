export type Theme = "historical" | "hidden_gems" | "family" | "architecture" | "nature" | "mixed";
export type SourceLicense = "ODbL" | "CC0" | "CC-BY-SA";

export interface Source { name: string; license: SourceLicense; reference: string; }
export interface Fact { key: string; value: string; source: Source; }

export type QuestionType = "A" | "B" | "C" | "D";
export interface Question {
  type: QuestionType;
  prompt: string;
  answer?: string | null;
  hint?: string | null;
  gates: boolean;
}

export interface GeoPoint { lat: number; lon: number; }
export interface POI {
  id: string;
  name: string;
  location: GeoPoint;
  facts: Fact[];
  background?: string | null;
  background_source?: Source | null;
}
export interface Stop { order: number; poi: POI; story: string; question: Question; }
export interface Trail {
  id: string;
  city: string;
  theme: Theme;
  requested_distance_km: number;
  actual_distance_km: number;
  estimated_duration_min: number;
  start: GeoPoint;
  stops: Stop[];
  attributions: string[];
}

export interface TrailRequest { start: GeoPoint; distance_km: number; theme: Theme; }
export interface AnswerRequest { stop_order: number; answer: string; attempt: number; }
export interface AnswerResult {
  correct: boolean;
  unlocked_next: boolean;
  revealed_answer?: string | null;
  feedback: string;
}

export type DraftStatus = "concept" | "review" | "published";

export interface DraftStop {
  order: number;
  poi: POI;
  story?: string | null;
  question?: Question | null;
}

export interface DraftTrail {
  id: string;
  title: string;
  city: string;
  theme: Theme;
  start: GeoPoint;
  requested_distance_km: number;
  actual_distance_km: number;
  estimated_duration_min: number;
  stops: DraftStop[];
  status: DraftStatus;
  attributions: string[];
}

export interface DraftCreate {
  title?: string;
  start: GeoPoint;
  distance_km?: number;
  theme?: Theme;
  from_concept?: boolean;
}

export interface DraftUpdate {
  title?: string;
  theme?: Theme;
  status?: DraftStatus;
  stop_poi_ids?: string[];
}

export interface RouteMeasureResult {
  distance_km: number;
  duration_min: number;
}

export interface StopContentUpdate {
  story?: string | null;
  question?: Question | null;
}

export interface StopGenerateRequest {
  fact_keys?: string[];
  tone?: string;
}

export interface StopGenerateResult {
  story: string;
  question: Question;
}

export interface CustomStopRequest {
  name: string;
  lat?: number;
  lon?: number;
}

export type CheckStatus = "ok" | "warning" | "blocking";

export interface StopGrounding {
  order: number;
  name: string;
  grounded: boolean;
  sources: string;
}

export interface ValidationCheck {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  per_stop: StopGrounding[];
  blocking: number;
  warnings: number;
  can_publish: boolean;
}
