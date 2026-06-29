import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { QuesterProvider, useQuester } from "../store";
import { Preview } from "./Preview";
import type { Trail } from "../../api/types";

const trail: Trail = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 105, start: { lat: 52.38, lon: 4.63 }, attributions: [],
  stops: [1, 2, 3, 4].map((order) => ({
    order, story: "s", question: { type: "C" as const, prompt: "?", gates: false },
    poi: { id: `p${order}`, name: `POI ${order}`, location: { lat: 52.38, lon: 4.63 }, facts: [] },
  })),
};

function Harness() {
  const { state, setTrail } = useQuester();
  return (
    <>
      <button onClick={() => setTrail(trail)}>seed</button>
      {state.trail && <Preview />}
      <output data-testid="phase">{state.phase}</output>
    </>
  );
}

test("shows stats and starts the trail", async () => {
  render(<QuesterProvider><Harness /></QuesterProvider>);
  await userEvent.click(screen.getByText("seed"));
  expect(screen.getByText("5,2")).toBeInTheDocument();
  expect(screen.getByText(/2 verrassingen onderweg/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Start speurtocht/i }));
  expect(screen.getByTestId("phase")).toHaveTextContent("stop");
});
