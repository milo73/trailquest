import { ApiError } from "./client";
import { getTrail, listTrails, submitAnswer } from "./trails";

const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);
const fail = (status: number, detail: string) =>
  Promise.resolve({ ok: false, status, statusText: "e", json: async () => ({ detail }) } as Response);

afterEach(() => jest.restoreAllMocks());

test("listTrails GETs /trails", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockReturnValue(ok([{ id: "t1" }]));
  const trails = await listTrails();
  expect(trails).toEqual([{ id: "t1" }]);
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/trails$/);
});

test("submitAnswer POSTs the body", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockReturnValue(ok({ correct: true, unlocked_next: true, feedback: "ok" }));
  const r = await submitAnswer("t1", { stop_order: 1, answer: "x", attempt: 1 });
  expect(r.unlocked_next).toBe(true);
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toMatchObject({ stop_order: 1, answer: "x", attempt: 1 });
});

test("throws ApiError on non-2xx", async () => {
  jest.spyOn(global, "fetch").mockReturnValue(fail(404, "Trail not found"));
  await expect(getTrail("nope")).rejects.toBeInstanceOf(ApiError);
});
