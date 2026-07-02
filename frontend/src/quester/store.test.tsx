import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { QuesterProvider, useQuester } from "./store";
import type { Trail } from "../api/types";

const wrapper = ({ children }: { children: React.ReactNode }) => <QuesterProvider>{children}</QuesterProvider>;

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 105, start: { lat: 52.38, lon: 4.63 },
  attributions: [],
  stops: [
    { order: 1, poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", questions: [{ type: "C", prompt: "?", gates: false }], primary_question_index: 0 },
    { order: 2, poi: { id: "p2", name: "Stadhuis", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", questions: [{ type: "A", prompt: "?", answer: "78", gates: true }], primary_question_index: 0 },
  ],
};

beforeEach(() => localStorage.clear());

test("setTrail moves to preview at the first stop", () => {
  const { result } = renderHook(() => useQuester(), { wrapper });
  act(() => result.current.setTrail(trail));
  expect(result.current.state.phase).toBe("preview");
  expect(result.current.state.currentOrder).toBe(1);
});

test("recordSolve adds points; arrive advances then finishes", () => {
  const { result } = renderHook(() => useQuester(), { wrapper });
  act(() => result.current.setTrail(trail));
  act(() => result.current.goToStop(1));
  act(() => result.current.recordSolve(1, { type: "C", correct: true, attempt: 1, usedHint: false }));
  expect(result.current.state.points).toBe(18);
  act(() => result.current.arriveAtNextOrFinish()); // -> navigate to stop 2
  expect(result.current.state.phase).toBe("navigate");
  expect(result.current.state.currentOrder).toBe(2);
  act(() => result.current.goToStop(2));
  act(() => result.current.arriveAtNextOrFinish()); // last -> finish
  expect(result.current.state.phase).toBe("finish");
});

test("persists across remount", () => {
  const first = renderHook(() => useQuester(), { wrapper });
  act(() => first.result.current.setTrail(trail));
  const second = renderHook(() => useQuester(), { wrapper });
  expect(second.result.current.state.trail?.id).toBe("t1");
});
