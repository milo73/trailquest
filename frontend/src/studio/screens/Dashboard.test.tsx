import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { DraftProvider } from "../draftStore";

const DRAFT_D1 = {
  id: "d1", title: "Mijn nieuwe tocht", city: "Haarlem", theme: "nature",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 3.4,
  estimated_duration_min: 60, stops: [], status: "concept", attributions: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("renders the trail cards and stats", async () => {
  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Haarlems Gouden Eeuw")).toBeInTheDocument();
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument();
  expect(screen.getByText("1.240")).toBeInTheDocument(); // keer gespeeld
});

test("lists real drafts from the API alongside the mock cards", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([DRAFT_D1]), { status: 200 })));
  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Mijn nieuwe tocht")).toBeInTheDocument(); // real draft
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument(); // mock card still there
});

test("clicking a real draft card calls GET /api/drafts/:id (loadDraft)", async () => {
  // First call: listDrafts returns [DRAFT_D1]
  // Second call (on click): getDraft("d1") returns DRAFT_D1
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/drafts/d1") {
      return Promise.resolve(new Response(JSON.stringify(DRAFT_D1), { status: 200 }));
    }
    // listDrafts
    return Promise.resolve(new Response(JSON.stringify([DRAFT_D1]), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);

  // Wait for the draft card to appear, then click it
  const card = await screen.findByText("Mijn nieuwe tocht");
  await userEvent.click(card);

  // loadDraft must have called GET /api/drafts/d1
  const getDraftCall = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1");
  expect(getDraftCall).toBeTruthy();
});
