import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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

test("delete draft: Annuleren keeps the card and issues no DELETE", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([DRAFT_D1]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);

  // Wait for the draft card
  await screen.findByText("Mijn nieuwe tocht");

  // Click the Verwijderen button (ghost button on the card, not a modal button yet)
  const deleteBtn = screen.getByRole("button", { name: "Verwijderen" });
  await userEvent.click(deleteBtn);

  // Dialog should appear
  expect(screen.getByRole("dialog", { name: "Tocht verwijderen" })).toBeInTheDocument();

  // Click Annuleren
  await userEvent.click(screen.getByRole("button", { name: "Annuleren" }));

  // Dialog gone, card still there
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Mijn nieuwe tocht")).toBeInTheDocument();

  // No DELETE request fired
  const deleteCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === "DELETE");
  expect(deleteCalls).toHaveLength(0);
});

test("delete draft: confirm Verwijderen issues DELETE and removes the card", async () => {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    // After deletion, listDrafts returns []
    return Promise.resolve(new Response(JSON.stringify([DRAFT_D1]), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);

  await screen.findByText("Mijn nieuwe tocht");

  // Open delete dialog
  const deleteBtn = screen.getByRole("button", { name: "Verwijderen" });
  await userEvent.click(deleteBtn);
  expect(screen.getByRole("dialog", { name: "Tocht verwijderen" })).toBeInTheDocument();

  // After confirm, listDrafts returns []
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });

  // Confirm deletion (click the modal's confirm button)
  const confirmBtns = screen.getAllByRole("button", { name: "Verwijderen" });
  // The confirm button in the dialog is the last one (or we pick from the dialog)
  const dialog = screen.getByRole("dialog", { name: "Tocht verwijderen" });
  const confirmBtn = dialog.querySelector("button[style*='#b5453a']") as HTMLElement
    ?? confirmBtns[confirmBtns.length - 1];
  await userEvent.click(confirmBtn);

  // DELETE /api/drafts/d1 must have been called
  const deleteCalls = fetchMock.mock.calls.filter((c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "DELETE");
  expect(deleteCalls).toHaveLength(1);
  expect(deleteCalls[0][0]).toBe("/api/drafts/d1");

  // Card should disappear
  expect(screen.queryByText("Mijn nieuwe tocht")).not.toBeInTheDocument();
});

test("Nieuwe tocht maken opens the form and generates a concept", async () => {
  const created = {
    id: "d1", title: "t", city: "Bloemendaal", theme: "nature",
    start: { lat: 52.4, lon: 4.6 }, requested_distance_km: 5, actual_distance_km: 4.8,
    estimated_duration_min: 60, stops: [], status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/drafts") && init?.method === "POST")
      return Promise.resolve(new Response(JSON.stringify(created), { status: 201 }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 })); // GET /drafts
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <DraftProvider>
        <Routes>
          <Route path="/studio" element={<Dashboard />} />
          <Route path="/studio/route" element={<div>route-page</div>} />
        </Routes>
      </DraftProvider>
    </MemoryRouter>
  );

  await userEvent.click(await screen.findByText(/Nieuwe tocht maken/i));
  await userEvent.type(await screen.findByLabelText(/plaats/i), "Bloemendaal");
  await userEvent.click(screen.getByRole("button", { name: /Genereer concept/i }));

  const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ place: "Bloemendaal", from_concept: true });

  // After successful generation, navigate to /studio/route
  expect(await screen.findByText("route-page")).toBeInTheDocument();
});
