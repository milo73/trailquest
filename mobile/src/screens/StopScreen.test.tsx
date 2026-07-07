import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QuesterProvider, useQuester } from "../store/QuesterStore";
import { StopScreen } from "./StopScreen";
import type { Trail } from "../api/types";

// TRAIL fixture — needs a gating question (type A) so Controleer matters
const TRAIL = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 4.8,
  estimated_duration_min: 60, start: { lat: 52.38, lon: 4.63 }, attributions: [], route_geometry: null,
  stops: [
    {
      id: "a", order: 1,
      poi: { id: "p1", name: "Grote Kerk", location: { lat: 52.38, lon: 4.63 }, facts: [] },
      story: "Een prachtige kerk.",
      questions: [{ type: "A", prompt: "Wanneer gebouwd?", answer: "1400", hint: null, gates: true }],
      primary_question_index: 0,
    },
    {
      id: "b", order: 2,
      poi: { id: "p2", name: "B", location: { lat: 52.39, lon: 4.64 }, facts: [] },
      story: "s2",
      questions: [{ type: "C", prompt: "?", gates: true }],
      primary_question_index: 0,
    },
  ],
} as unknown as Trail;

jest.mock("../api/trails", () => ({
  listTrails: jest.fn(),
  getTrail: jest.fn(),
  submitAnswer: jest.fn(),
}));

import * as trailsApi from "../api/trails";

// Seed store imperatively via hook actions before rendering StopScreen
function StopTestApp() {
  const { state, setTrail, startWalk, arrive } = useQuester();

  // Seed on first render
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    // Dispatch synchronously in a single act in the test
  }, []);

  if (state.phase !== "stop" || !state.trail) {
    return null;
  }
  return <StopScreen />;
}

beforeEach(() => {
  jest.clearAllMocks();
  (trailsApi.submitAnswer as jest.Mock).mockResolvedValue({
    correct: true,
    unlocked_next: true,
    feedback: "Correct!",
  });
});

async function renderInStopPhase() {
  let questerRef: ReturnType<typeof useQuester> | null = null;

  function CaptureQuester() {
    questerRef = useQuester();
    return null;
  }

  function FullApp() {
    const { state } = useQuester();
    return (
      <>
        <CaptureQuester />
        {state.phase === "stop" && state.trail ? <StopScreen /> : null}
      </>
    );
  }

  await render(
    <QuesterProvider>
      <FullApp />
    </QuesterProvider>
  );

  // Seed to stop phase
  await act(async () => {
    questerRef!.setTrail(TRAIL);
  });
  await act(async () => {
    questerRef!.startWalk();
  });
  await act(async () => {
    questerRef!.arrive();
  });

  return { questerRef: questerRef! };
}

test('type an answer + press "Controleer" → "Volgende" appears', async () => {
  await renderInStopPhase();

  await waitFor(() => {
    expect(screen.getByText("Wanneer gebouwd?")).toBeTruthy();
  });

  const input = screen.getByPlaceholderText("Jouw antwoord");
  await act(async () => {
    fireEvent.changeText(input, "1400");
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Controleer"));
  });

  await waitFor(() => {
    expect(screen.getByText("Volgende")).toBeTruthy();
  });
});

test('wrong answer keeps input visible; 3rd wrong answer reveals and shows "Volgende"', async () => {
  // Mock: attempts 1 & 2 return wrong non-terminal; attempt 3 reveals
  const submitMock = trailsApi.submitAnswer as jest.Mock;
  submitMock
    .mockResolvedValueOnce({ correct: false, unlocked_next: false, feedback: "Net niet." })
    .mockResolvedValueOnce({ correct: false, unlocked_next: false, feedback: "Net niet." })
    .mockResolvedValueOnce({
      correct: false,
      unlocked_next: true,
      revealed_answer: "78",
      feedback: "Het antwoord was: 78.",
    });

  await renderInStopPhase();

  await waitFor(() => {
    expect(screen.getByText("Wanneer gebouwd?")).toBeTruthy();
  });

  // Attempt 1 — wrong answer; input must survive
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText("Jouw antwoord"), "1300");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Controleer"));
  });
  await waitFor(() => {
    // Inline feedback visible
    expect(screen.getByText("Net niet.")).toBeTruthy();
  });
  // Input is still there so user can retry (no freeze)
  expect(screen.getByPlaceholderText("Jouw antwoord")).toBeTruthy();
  expect(screen.getByText("Controleer")).toBeTruthy();
  // "Volgende" must NOT appear yet
  expect(screen.queryByText("Volgende")).toBeNull();

  // Attempt 2 — wrong answer again
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText("Jouw antwoord"), "1350");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Controleer"));
  });
  await waitFor(() => {
    expect(screen.getByText("Net niet.")).toBeTruthy();
  });
  expect(screen.getByPlaceholderText("Jouw antwoord")).toBeTruthy();
  expect(screen.queryByText("Volgende")).toBeNull();

  // Attempt 3 — backend reveals the answer
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText("Jouw antwoord"), "1111");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Controleer"));
  });
  await waitFor(() => {
    expect(screen.getByText("Het antwoord was: 78.")).toBeTruthy();
  });
  // Revealed answer shown
  expect(screen.getByText("Antwoord: 78")).toBeTruthy();
  // Input is gone — terminal view
  expect(screen.queryByPlaceholderText("Jouw antwoord")).toBeNull();
  // "Volgende" appears
  expect(screen.getByText("Volgende")).toBeTruthy();
});

test('pressing "Volgende" advances the phase', async () => {
  await renderInStopPhase();

  await waitFor(() => {
    expect(screen.getByText("Wanneer gebouwd?")).toBeTruthy();
  });

  const input = screen.getByPlaceholderText("Jouw antwoord");
  await act(async () => {
    fireEvent.changeText(input, "1400");
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Controleer"));
  });

  await waitFor(() => {
    expect(screen.getByText("Volgende")).toBeTruthy();
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Volgende"));
  });

  // After nextOrFinish(), phase becomes navigate → StopScreen unmounts
  await waitFor(() => {
    expect(screen.queryByText("Wanneer gebouwd?")).toBeNull();
  });
});
