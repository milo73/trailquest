import { afterEach, expect, test, vi } from "vitest";
import { apiFetch } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test("apiFetch times out and throws ApiError 408", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  );
  const p = apiFetch("/slow", undefined, { timeoutMs: 50 });
  const assertion = expect(p).rejects.toMatchObject({ name: "ApiError", status: 408 });
  await vi.advanceTimersByTimeAsync(60);
  await assertion;
});

test("apiFetch without timeoutMs works normally", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  await expect(apiFetch("/x")).resolves.toEqual({ ok: true });
});
