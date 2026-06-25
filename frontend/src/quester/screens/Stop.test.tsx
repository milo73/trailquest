import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Stop } from "./Stop";
import type { Trail } from "../../api/types";

afterEach(() => vi.restoreAllMocks());

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [{
    order: 1, story: "Kijk omhoog.",
    question: { type: "A", prompt: "Hoe hoog is de toren?", answer: "78 meter", hint: "13 x 6", gates: true },
    poi: { id: "p1", name: "Sint-Bavokerk", location: { lat: 52.38, lon: 4.63 },
      facts: [{ key: "height_m", value: "78", source: { name: "Wikidata", license: "CC0", reference: "wikidata:Q1" } }] },
  }],
};

function Harness() {
  const { state, setTrail, goToStop } = useQuester();
  return (
    <>
      <button onClick={() => { setTrail(trail); goToStop(1); }}>seed</button>
      {state.phase === "stop" && <Stop />}
      <output data-testid="phase">{state.phase}</output>
      <output data-testid="points">{state.points}</output>
    </>
  );
}

function mockAnswer(result: object) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 })));
}

test("correct gating answer unlocks next and scores points", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("Wikidata")).toBeInTheDocument(); // source badge
  mockAnswer({ correct: true, unlocked_next: true, feedback: "Correct!" });
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "78 meter");
  await userEvent.click(screen.getByLabelText("Antwoord versturen"));
  expect(await screen.findByText("Correct!")).toBeInTheDocument();
  expect(screen.getByTestId("points")).toHaveTextContent("18");
  await userEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  expect(screen.getByTestId("phase")).not.toHaveTextContent("stop");
});

test("wrong answer keeps the stop locked", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  mockAnswer({ correct: false, unlocked_next: false, feedback: "Niet quite. Hint: 13 x 6" });
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "10");
  await userEvent.click(screen.getByLabelText("Antwoord versturen"));
  expect(await screen.findByText(/Hint: 13 x 6/)).toBeInTheDocument();
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
