import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import QuesterApp from "./QuesterApp";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

test("end-to-end: generate a one-stop trail and finish it", async () => {
  const trail = {
    id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 5,
    estimated_duration_min: 100, start: { lat: 52.38, lon: 4.63 }, attributions: [],
    stops: [{ order: 1, story: "s", questions: [{ type: "C", prompt: "Wat denk je?", gates: false }], primary_question_index: 0,
      poi: { id: "p1", name: "Grote Markt", location: { lat: 52.38, lon: 4.63 }, facts: [] } }],
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith("/answer"))
      return Promise.resolve(new Response(JSON.stringify({ correct: true, unlocked_next: true, feedback: "Mooi." }), { status: 200 }));
    // GET /trails (list) — return empty so Browse shows no trails
    if (url.endsWith("/trails") && (!init?.method || init.method === "GET"))
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    // POST /trails (create) and other calls
    return Promise.resolve(new Response(JSON.stringify(trail), { status: 201 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter initialEntries={["/play"]}><QuesterApp /></MemoryRouter>);
  // app lands on Browse; navigate to Configure first
  await userEvent.click(await screen.findByRole("button", { name: /Zelf genereren/i }));
  await userEvent.click(screen.getByRole("button", { name: /Genereer speurtocht/i }));
  await userEvent.click(await screen.findByRole("button", { name: /Start speurtocht/i }));
  await userEvent.type(screen.getByPlaceholderText(/antwoord/i), "iets");
  await userEvent.click(screen.getByLabelText("Antwoord versturen"));
  await userEvent.click(await screen.findByRole("button", { name: /Volgende/i }));
  await waitFor(() => expect(screen.getByText(/Goed gedaan/i)).toBeInTheDocument());
});
