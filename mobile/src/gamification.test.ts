import { describe, expect, test } from "@jest/globals";
import { deriveBadges, pointsFor } from "./gamification";
import type { Trail } from "./api/types";

describe("pointsFor", () => {
  test("first try, no hint = 18", () => {
    expect(pointsFor({ correct: true, attempt: 1, usedHint: false })).toBe(18);
  });
  test("later attempt with hint = 10", () => {
    expect(pointsFor({ correct: true, attempt: 2, usedHint: true })).toBe(10);
  });
  test("incorrect / revealed = 0", () => {
    expect(pointsFor({ correct: false, attempt: 3, usedHint: false })).toBe(0);
  });
});

const trail = (theme: Trail["theme"]): Trail => ({
  id: "t", city: "Haarlem", theme, requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 0, lon: 0 }, stops: [], attributions: [],
});

describe("deriveBadges", () => {
  test("historical theme yields Historicus + Stadskenner", () => {
    const badges = deriveBadges(trail("historical"), [
      { type: "A", correct: true, attempt: 2, usedHint: true },
    ]).map((b) => b.id);
    expect(badges).toContain("historicus");
    expect(badges).toContain("stadskenner");
    expect(badges).not.toContain("speurneus");
  });
  test("a perfect solve yields Speurneus", () => {
    const badges = deriveBadges(trail("mixed"), [
      { type: "A", correct: true, attempt: 1, usedHint: false },
    ]).map((b) => b.id);
    expect(badges).toContain("speurneus");
  });
});
