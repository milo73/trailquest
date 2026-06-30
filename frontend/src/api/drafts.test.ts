import { afterEach, expect, test, vi } from "vitest";
import { createDraft, updateDraft, updateStopContent, generateStopContent } from "./drafts";
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

test("updateStopContent PUTs to the stop path", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await updateStopContent("d1", 2, { story: "hi" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1/stops/2");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({ story: "hi" });
});

test("generateStopContent POSTs fact_keys + tone", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ story: "s", question: { type: "C", prompt: "?", gates: false } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const res = await generateStopContent("d1", 1, { fact_keys: ["height_m"], tone: "speels" });
  expect(res.story).toBe("s");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1/stops/1/generate");
  expect(JSON.parse(init.body)).toEqual({ fact_keys: ["height_m"], tone: "speels" });
});
