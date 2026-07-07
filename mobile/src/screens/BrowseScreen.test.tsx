import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QuesterProvider, useQuester } from "../store/QuesterStore";
import { BrowseScreen } from "./BrowseScreen";
import { PreviewScreen } from "./PreviewScreen";
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

// Mock the API module
jest.mock("../api/trails", () => ({
  listTrails: jest.fn(),
  getTrail: jest.fn(),
  submitAnswer: jest.fn(),
}));

import * as trailsApi from "../api/trails";

// A minimal wrapper that shows BrowseScreen or PreviewScreen based on phase
function TestApp() {
  const { state } = useQuester();
  if (state.phase === "preview") {
    return <PreviewScreen />;
  }
  return <BrowseScreen />;
}

beforeEach(() => {
  jest.clearAllMocks();
  (trailsApi.listTrails as jest.Mock).mockResolvedValue([TRAIL]);
  (trailsApi.getTrail as jest.Mock).mockResolvedValue(TRAIL);
});

test("lists trails: shows city text", async () => {
  const rendered = await render(
    <QuesterProvider>
      <TestApp />
    </QuesterProvider>
  );

  // Wait for the async listTrails call to resolve and render the trail
  await waitFor(() => {
    expect(screen.getByText(/Haarlem/)).toBeTruthy();
  });
});

test('pressing "Speel" transitions to Preview', async () => {
  await render(
    <QuesterProvider>
      <TestApp />
    </QuesterProvider>
  );

  // Wait for trails to load
  await waitFor(() => {
    expect(screen.getByText("Speel")).toBeTruthy();
  });

  // Press Speel
  await act(async () => {
    fireEvent.press(screen.getByText("Speel"));
  });

  // After getTrail resolves + setTrail, phase = preview — PreviewScreen shows the stats label
  await waitFor(() => {
    // PreviewScreen renders "JE SPEURTOCHT IS KLAAR"
    expect(screen.getByText("JE SPEURTOCHT IS KLAAR")).toBeTruthy();
  });
});
