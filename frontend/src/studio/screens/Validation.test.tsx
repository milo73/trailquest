import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DraftProvider } from "../draftStore";
import { Validation } from "./Validation";

const DRAFT = {
  id: "d1", title: "t", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 60, stops: [], status: "concept", attributions: [],
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    checks: [
      { id: "grounding", label: "Grounding", detail: "1 / 2 stops met verifieerbare feiten", status: "blocking" },
      { id: "distance", label: "Afstandstolerantie", detail: "5 km — doel 5 km (±15%)", status: "ok" },
    ],
    per_stop: [
      { order: 1, name: "Grote Markt", sources: "Wikidata", grounded: true },
      { order: 2, name: "Mijn plek", sources: "geen feiten", grounded: false },
    ],
    blocking: 1, warnings: 0, can_publish: false,
    ...overrides,
  };
}

beforeEach(() => localStorage.setItem("tq.studio.draft", "d1"));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

function stub(routes: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(routes(String(url)))));
}

test("renders the real per-stop grounding and disables publish when blocking", async () => {
  stub((url) =>
    url.endsWith("/validation")
      ? new Response(JSON.stringify(report()), { status: 200 })
      : new Response(JSON.stringify(DRAFT), { status: 200 }),
  );
  render(<MemoryRouter><DraftProvider><Validation /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Mijn plek")).toBeInTheDocument();
  expect(screen.getByText("geen feiten")).toBeInTheDocument();
  expect(within(screen.getByTestId("blocking-count-card")).getByText("1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Publiceren naar moderatie/i })).toBeDisabled();
});

test("a clean report publishes to moderation", async () => {
  stub((url) => {
    if (url.endsWith("/validation"))
      return new Response(JSON.stringify(report({ checks: [{ id: "grounding", label: "Grounding", detail: "2 / 2", status: "ok" }], per_stop: [{ order: 1, name: "A", sources: "Wikidata", grounded: true }, { order: 2, name: "B", sources: "Wikidata", grounded: true }], blocking: 0, can_publish: true })), { status: 200 });
    if (url.endsWith("/publish"))
      return new Response(JSON.stringify({ ...DRAFT, status: "review" }), { status: 200 });
    return new Response(JSON.stringify(DRAFT), { status: 200 });
  });
  render(<MemoryRouter><DraftProvider><Validation /></DraftProvider></MemoryRouter>);
  const btn = await screen.findByRole("button", { name: /Publiceren naar moderatie/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);
  expect(await screen.findByText(/Verzonden naar moderatie/i)).toBeInTheDocument();
});
