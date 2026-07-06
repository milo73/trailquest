import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import QuesterApp from "../QuesterApp";

const TRAIL = {
  id: "d1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 4.8,
  estimated_duration_min: 60, start: { lat: 52.38, lon: 4.63 },
  stops: [{ id: "p1::historical", order: 1, poi: { id: "p1", name: "Grote Kerk", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", questions: [{ type: "C", prompt: "?", answer: null, hint: null, gates: false }], primary_question_index: 0 }],
  attributions: [],
};

afterEach(() => vi.restoreAllMocks());

test("Browse lists published trails and plays one", async () => {
  const fetchMock = vi.fn((url: string) => {
    if (String(url).endsWith("/trails/d1")) return Promise.resolve(new Response(JSON.stringify(TRAIL), { status: 200 }));
    if (String(url).endsWith("/trails")) return Promise.resolve(new Response(JSON.stringify([TRAIL]), { status: 200 }));
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  render(<QuesterApp />);
  // the browse list shows the published trail
  expect(await screen.findByText(/Haarlem/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Speel/i }));
  // loading it by id advances into the preview flow (trail title/city visible in Preview)
  const matches = await screen.findAllByText(/Voorvertoning|Start|Preview|JE SPEURTOCHT IS KLAAR/i);
  expect(matches.length).toBeGreaterThan(0);
});
