import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Navigate } from "./Navigate";
import type { Trail } from "../../api/types";

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [
    { id: "p1::historical", order: 1, story: "s", questions: [{ type: "C", prompt: "?", gates: false }], primary_question_index: 0, poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] } },
    { id: "p2::historical", order: 2, story: "s", questions: [{ type: "A", prompt: "?", answer: "78", gates: true }], primary_question_index: 0, poi: { id: "p2", name: "Sint-Bavokerk", location: { lat: 52.38, lon: 4.63 }, facts: [] } },
  ],
};

function Harness() {
  const { state, setTrail, arriveAtNextOrFinish } = useQuester();
  return (
    <>
      <button onClick={() => { setTrail(trail); arriveAtNextOrFinish(); }}>seed</button>
      {state.phase === "navigate" && <Navigate />}
      <output data-testid="phase">{state.phase}</output>
    </>
  );
}

test("shows the next stop and the 'Ik ben er' button arrives", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("Sint-Bavokerk")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Ik ben er/i }));
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
