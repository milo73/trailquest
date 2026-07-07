import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { QuesterProvider, useQuester } from "../store/QuesterStore";
import { FinishScreen } from "./FinishScreen";
import type { Trail } from "../api/types";

// TRAIL fixture (same as store test)
const TRAIL = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 4.8,
  estimated_duration_min: 60, start: { lat: 52.38, lon: 4.63 }, attributions: [], route_geometry: null,
  stops: [
    { id: "a", order: 1, poi: { id: "p1", name: "A", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s1", questions: [{ type: "C", prompt: "?", gates: true }], primary_question_index: 0 },
    { id: "b", order: 2, poi: { id: "p2", name: "B", location: { lat: 52.39, lon: 4.64 }, facts: [] }, story: "s2", questions: [{ type: "C", prompt: "?", gates: true }], primary_question_index: 0 },
  ],
} as unknown as Trail;

// Seed the store: set trail + record some solves + jump to finish
function StoreSeeder({ children }: { children: React.ReactNode }) {
  const { setTrail, startWalk, arrive, recordSolve, nextOrFinish, state } = useQuester();
  React.useEffect(() => {
    setTrail(TRAIL);
  }, []);
  React.useEffect(() => {
    if (state.phase === "preview") startWalk();
  }, [state.phase]);
  React.useEffect(() => {
    if (state.phase === "navigate" && state.currentOrder === 1) {
      arrive();
    }
    if (state.phase === "navigate" && state.currentOrder === 2) {
      arrive();
    }
  }, [state.phase, state.currentOrder]);
  React.useEffect(() => {
    if (state.phase === "stop" && state.currentOrder === 1) {
      // Record solve for stop 1 (first try, no hint — earns Speurneus badge)
      recordSolve(1, { type: "A", correct: true, attempt: 1, usedHint: false });
      nextOrFinish();
    }
    if (state.phase === "stop" && state.currentOrder === 2) {
      recordSolve(2, { type: "C", correct: true, attempt: 1, usedHint: false });
      nextOrFinish();
    }
  }, [state.phase, state.currentOrder]);
  return <>{children}</>;
}

function TestApp() {
  const { state } = useQuester();
  if (state.phase !== "finish") return null;
  return <FinishScreen />;
}

test("renders score + badges when finish", async () => {
  await render(
    <QuesterProvider>
      <StoreSeeder>
        <TestApp />
      </StoreSeeder>
    </QuesterProvider>
  );

  // Wait for finish phase
  await waitFor(() => {
    // Points: stop1 = 18 (correct + first try + no hint), stop2 = 18 → total 36
    // The hero section shows points
    expect(screen.getByText("36")).toBeTruthy();
  });

  // Should have "Stadskenner" badge (always) and "Speurneus" (first-try, no-hint solve)
  expect(screen.getByText("Stadskenner")).toBeTruthy();
  expect(screen.getByText("Speurneus")).toBeTruthy();
});
