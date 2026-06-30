import { afterEach, expect, test, vi } from "vitest";
import { createDraft, updateDraft } from "./drafts";
import { getPois } from "./pois";

afterEach(() => vi.restoreAllMocks());

test("createDraft POSTs the request and returns the draft", async () => {
  const draft = { id: "d1", title: "Nieuwe tocht", stops: [] };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await createDraft({ start: { lat: 52.38, lon: 4.63 } });

  expect(result).toEqual(draft);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts");
  expect(init.method).toBe("POST");
});

test("updateDraft PUTs stop_poi_ids", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await updateDraft("d1", { stop_poi_ids: ["a", "b"] });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({ stop_poi_ids: ["a", "b"] });
});

test("getPois builds the query string", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await getPois({ lat: 52.38, lon: 4.63, distance_km: 5 });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/pois?lat=52.38&lon=4.63&distance_km=5");
});
