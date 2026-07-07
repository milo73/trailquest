import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftProvider, useDraft } from "./draftStore";
import type { DraftTrail, POI } from "../api/types";

const wrapper = ({ children }: { children: React.ReactNode }) => <DraftProvider>{children}</DraftProvider>;

const poi = (id: string, name: string): POI => ({ id, name, location: { lat: 52.38, lon: 4.63 }, facts: [] });

const draft = (stops: { order: number; poi: POI }[]): DraftTrail => ({
  id: "d1", title: "Nieuwe tocht", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1.2,
  estimated_duration_min: 20, stops: stops.map((s) => ({ id: `${s.poi.id}::historical`, ...s, questions: [] })), status: "concept", attributions: [],
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function mockJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("createDraft sets the draft and persists its id", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJson(draft([]), 201)));
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  expect(result.current.draft?.id).toBe("d1");
  expect(localStorage.getItem("tq.studio.draft")).toBe("d1");
});

test("addStop optimistically appends then replaces with the server copy", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "Stadhuis") }]))); // updateDraft
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  await act(async () => {
    await result.current.addStop(poi("p1", "Stadhuis"));
  });

  await waitFor(() => expect(result.current.draft?.stops).toHaveLength(1));
  expect(result.current.draft?.stops[0].poi.name).toBe("Stadhuis");
  // the second fetch is the PUT carrying the new stop id
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body).stop_poi_ids).toEqual(["p1"]);
});

test("setActiveStop records the selected order", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)));
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  act(() => result.current.setActiveStop(1));
  expect(result.current.activeStopOrder).toBe(1);
});

test("saveStopContent PUTs and replaces the draft with the server copy", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson({ ...draft([{ order: 1, poi: poi("p1", "X") }]), stops: [{ order: 1, poi: poi("p1", "X"), story: "Saved." }] })); // PUT
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.saveStopContent(1, { story: "Saved." }); });
  expect(result.current.draft?.stops[0].story).toBe("Saved.");
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1/stops/1");
});

test("generateStopContent returns generated content without changing the draft", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson({ story: "Gen.", question: { type: "C", prompt: "?", gates: false } })); // generate
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  let gen: { story: string } | undefined;
  await act(async () => { gen = await result.current.generateStopContent(1, { tone: "speels" }); });
  expect(gen?.story).toBe("Gen.");
});

test("setActiveStop persists, and a fresh provider restores activeStopOrder", () => {
  localStorage.clear();
  const first = renderHook(() => useDraft(), { wrapper });
  act(() => first.result.current.setActiveStop(3));
  expect(localStorage.getItem("tq.studio.activeStop")).toBe("3");
  const second = renderHook(() => useDraft(), { wrapper });
  expect(second.result.current.activeStopOrder).toBe(3);
});

test("renameDraft PUTs the title and replaces the draft; saving toggles", async () => {
  const renamed = { ...draft([]), title: "Hernoemd" };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(renamed)); // updateDraft(title)
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.renameDraft("Hernoemd"); });
  expect(result.current.draft?.title).toBe("Hernoemd");
  expect(result.current.saving).toBe(false);
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body)).toEqual({ title: "Hernoemd" });
});

test("addCustomStop POSTs to /stops and replaces the draft", async () => {
  const withStop = draft([{ order: 1, poi: poi("custom:x", "Mijn plek") }]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(withStop, 201)); // createCustomStop
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addCustomStop({ name: "Mijn plek" }); });
  expect(result.current.draft?.stops[0].poi.name).toBe("Mijn plek");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/drafts/d1/stops");
});

test("addCustomStop with insertAfter=1 moves the appended stop into position via one PUT", async () => {
  const twoStops = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("p2", "Stop B") },
  ]);
  // Backend appends the custom stop at the end (order 3).
  const appended = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("p2", "Stop B") },
    { order: 3, poi: poi("custom:c1", "Mijn plek") },
  ]);
  const reordered = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("custom:c1", "Mijn plek") },
    { order: 3, poi: poi("p2", "Stop B") },
  ]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(twoStops, 201)) // createDraft
    .mockResolvedValueOnce(mockJson(appended, 201)) // createCustomStop (POST)
    .mockResolvedValueOnce(mockJson(reordered)); // reorder PUT
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addCustomStop({ name: "Mijn plek" }, 1); });

  // exactly one POST + one reorder PUT
  expect(fetchMock.mock.calls[1][0]).toBe("/api/drafts/d1/stops");
  const putCall = fetchMock.mock.calls[2];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body).stop_poi_ids).toEqual(["p1", "custom:c1", "p2"]);
  expect(fetchMock.mock.calls).toHaveLength(3);
});

test("addCustomStop with insertAfter pointing at the end skips the reorder PUT", async () => {
  const oneStop = draft([{ order: 1, poi: poi("p1", "Stop A") }]);
  const appended = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("custom:c1", "Mijn plek") },
  ]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(oneStop, 201)) // createDraft
    .mockResolvedValueOnce(mockJson(appended, 201)); // createCustomStop (POST)
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addCustomStop({ name: "Mijn plek" }, 1); });

  // already in position after the POST -> no extra PUT
  expect(fetchMock.mock.calls).toHaveLength(2);
  expect(result.current.draft?.stops).toHaveLength(2);
});

// --- Task 7: stop insertion position ---

test("addStop with insertAfter=1 inserts the new stop between existing stops", async () => {
  const initialDraft = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("p2", "Stop B") },
  ]);
  const newPoi = poi("p3", "Nieuw");
  // The PUT response after insertion: server returns the authoritative order
  const afterInsert = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: newPoi },
    { order: 3, poi: poi("p2", "Stop B") },
  ]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(initialDraft, 201)) // createDraft
    .mockResolvedValueOnce(mockJson(afterInsert)); // updateDraft (PUT)
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addStop(newPoi, 1); });

  await waitFor(() => expect(result.current.draft?.stops).toHaveLength(3));
  // The PUT must send p1, p3, p2 — new POI is placed second
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body).stop_poi_ids).toEqual(["p1", "p3", "p2"]);
});

test("addStop without insertAfter appends (existing behavior preserved)", async () => {
  const initialDraft = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("p2", "Stop B") },
  ]);
  const newPoi = poi("p3", "Nieuw");
  const afterAppend = draft([
    { order: 1, poi: poi("p1", "Stop A") },
    { order: 2, poi: poi("p2", "Stop B") },
    { order: 3, poi: newPoi },
  ]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(initialDraft, 201)) // createDraft
    .mockResolvedValueOnce(mockJson(afterAppend)); // updateDraft (PUT)
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addStop(newPoi); });

  await waitFor(() => expect(result.current.draft?.stops).toHaveLength(3));
  const putCall = fetchMock.mock.calls[1];
  expect(JSON.parse(putCall[1].body).stop_poi_ids).toEqual(["p1", "p2", "p3"]);
});
