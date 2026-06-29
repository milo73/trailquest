import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StopEditor, canGate } from "./StopEditor";
import { DraftProvider, useDraft } from "../draftStore";

test("canGate only allows A and D", () => {
  expect(canGate("A")).toBe(true);
  expect(canGate("D")).toBe(true);
  expect(canGate("B")).toBe(false);
  expect(canGate("C")).toBe(false);
});

test("selecting type B disables and forces off the gate toggle", async () => {
  render(
    <MemoryRouter>
      <DraftProvider>
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  const gate = screen.getByRole("switch", { name: /gaten/i });
  expect(gate).toBeChecked(); // starts as Type A, gate on
  await userEvent.selectOptions(screen.getByLabelText(/Vraagtype/i), "B");
  expect(gate).toBeDisabled();
  expect(gate).not.toBeChecked();
});

test("verhaal word count updates as you edit", async () => {
  render(
    <MemoryRouter>
      <DraftProvider>
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  const textarea = screen.getByLabelText(/Verhaal/i);
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "een twee drie");
  expect(screen.getByText(/3 woorden/)).toBeInTheDocument();
});

test("shows the active draft stop's POI when one is selected", async () => {
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return (
      <button
        onClick={async () => {
          // stub fetch so createDraft returns a draft with our POI as stop 1
          await createDraft({ start: { lat: 52.38, lon: 4.63 } });
          setActiveStop(1);
        }}
      >
        seed
      </button>
    );
  }
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] } }],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 })));
  render(
    <MemoryRouter>
      <DraftProvider>
        <Seed />
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByText("seed"));
  const matches = await screen.findAllByText("Waag");
  expect(matches.length).toBeGreaterThan(0);
});
