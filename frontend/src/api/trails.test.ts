import { afterEach, expect, test, vi } from "vitest";
import { createTrail, submitAnswer } from "./trails";

afterEach(() => vi.restoreAllMocks());

test("createTrail POSTs the request and returns the trail", async () => {
  const trail = { id: "t1", stops: [] };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(trail), { status: 201, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await createTrail({ start: { lat: 52.38, lon: 4.63 }, distance_km: 5, theme: "historical" });

  expect(result).toEqual(trail);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/trails");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ start: { lat: 52.38, lon: 4.63 }, distance_km: 5, theme: "historical" });
});

test("throws ApiError with detail on non-2xx", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not enough POIs" }), { status: 422 }),
    ),
  );
  await expect(submitAnswer("t1", { stop_order: 1, answer: "x", attempt: 1 })).rejects.toMatchObject({
    name: "ApiError",
    status: 422,
    message: "Not enough POIs",
  });
});
