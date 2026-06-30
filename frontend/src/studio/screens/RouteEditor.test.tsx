import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DraftProvider, useDraft } from "../draftStore";
import { RouteEditor } from "./RouteEditor";
import type { DraftTrail, POI } from "../../api/types";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const poi = (id: string, name: string, facts: POI["facts"] = []): POI => ({ id, name, location: { lat: 52.38, lon: 4.63 }, facts });

const draft = (stops: { order: number; poi: POI }[]): DraftTrail => ({
  id: "d1", title: "Haarlems Gouden Eeuw", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 110, stops, status: "concept", attributions: [],
});

function Harness({ seed }: { seed: DraftTrail }) {
  const { draft: d, createDraft } = useDraft();
  // seed the store by stubbing createDraft's fetch, then calling it once
  return (
    <>
      {!d && <button onClick={() => createDraft({ start: seed.start })}>seed</button>}
      {d && <RouteEditor />}
    </>
  );
}

test("renders real draft stops and the measured distance", async () => {
  const seeded = draft([
    { order: 1, poi: poi("p1", "Stadhuis", [{ key: "y", value: "1", source: { name: "Wikidata", license: "CC0", reference: "q" } }]) },
    { order: 2, poi: poi("p2", "Molen De Adriaan") },
  ]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(seeded), { status: 201 })));
  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));

  expect(await screen.findByText("Stadhuis")).toBeInTheDocument();
  expect(screen.getByText("Molen De Adriaan")).toBeInTheDocument();
  expect(screen.getAllByText("5,2 km").length).toBeGreaterThan(0); // distance meter from the draft
  expect(screen.getByText(/geen feiten/i)).toBeInTheDocument(); // p2 has no facts
});

test("opening the picker and choosing a candidate calls addStop (PUT)", async () => {
  const seeded = draft([]);
  const candidate: POI = { id: "c1", name: "Vleeshal", location: { lat: 52.38, lon: 4.63 }, facts: [] };
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url.startsWith("/api/pois")) return Promise.resolve(new Response(JSON.stringify([candidate]), { status: 200 }));
    if (url === "/api/drafts/d1" ) return Promise.resolve(new Response(JSON.stringify(draft([{ order: 1, poi: candidate }])), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(seeded), { status: 201 })); // createDraft
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Stop toevoegen/i }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByText("Vleeshal"));

  // a PUT to /api/drafts/d1 with the new stop id was made
  await screen.findByText("Vleeshal", {}, { timeout: 2000 });
  const putCall = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1");
  expect(putCall).toBeTruthy();
  const putInit = putCall![1] as RequestInit;
  expect(JSON.parse(putInit.body as string).stop_poi_ids).toEqual(["c1"]);
});
