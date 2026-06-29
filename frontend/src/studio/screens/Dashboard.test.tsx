import { render, screen } from "@testing-library/react";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { DraftProvider } from "../draftStore";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the trail cards and stats", () => {
  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);
  expect(screen.getByText("Haarlems Gouden Eeuw")).toBeInTheDocument();
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument();
  expect(screen.getByText("1.240")).toBeInTheDocument(); // keer gespeeld
});

test("lists real drafts from the API alongside the mock cards", async () => {
  const drafts = [
    { id: "d1", title: "Mijn nieuwe tocht", city: "Haarlem", theme: "nature",
      start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 3.4,
      estimated_duration_min: 60, stops: [], status: "concept", attributions: [] },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(drafts), { status: 200 })));
  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Mijn nieuwe tocht")).toBeInTheDocument(); // real draft
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument(); // mock card still there
});
