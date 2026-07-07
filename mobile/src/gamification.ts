import type { QuestionType, Theme, Trail } from "./api/types";

export const BASE_POINTS = 10;
export const FIRST_TRY_BONUS = 5;
export const NO_HINT_BONUS = 3;

export function pointsFor({
  correct,
  attempt,
  usedHint,
}: {
  correct: boolean;
  attempt: number;
  usedHint: boolean;
}): number {
  if (!correct) return 0;
  let p = BASE_POINTS;
  if (attempt === 1) p += FIRST_TRY_BONUS;
  if (!usedHint) p += NO_HINT_BONUS;
  return p;
}

export interface SolveRecord {
  type: QuestionType;
  correct: boolean;
  attempt: number;
  usedHint: boolean;
}

export interface Badge {
  id: string;
  label: string;
}

const THEME_BADGE: Partial<Record<Theme, Badge>> = {
  historical: { id: "historicus", label: "Historicus" },
  architecture: { id: "bouwmeester", label: "Bouwmeester" },
  nature: { id: "natuurkenner", label: "Natuurkenner" },
  hidden_gems: { id: "speurder", label: "Speurder" },
  family: { id: "gezinsheld", label: "Gezinsheld" },
};

export function deriveBadges(trail: Trail, solves: SolveRecord[]): Badge[] {
  const badges: Badge[] = [{ id: "stadskenner", label: "Stadskenner" }];
  const themeBadge = THEME_BADGE[trail.theme];
  if (themeBadge) badges.push(themeBadge);
  if (solves.some((s) => s.correct && s.attempt === 1 && !s.usedHint)) {
    badges.push({ id: "speurneus", label: "Speurneus" });
  }
  return badges;
}
