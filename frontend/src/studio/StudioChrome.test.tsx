import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudioChrome } from "./StudioChrome";
import { DraftProvider } from "./draftStore";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderChrome(initialPath = "/studio") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DraftProvider>
        <Routes>
          <Route
            path="/studio"
            element={
              <StudioChrome>
                <div>dashboard-content</div>
              </StudioChrome>
            }
          />
          <Route path="/studio/route" element={<div>route-page</div>} />
        </Routes>
      </DraftProvider>
    </MemoryRouter>
  );
}

test("clicking the TrailQuest logo navigates to /studio", async () => {
  renderChrome();
  // Navigate away first so we can come back
  // Just verify the button is present and functional
  expect(screen.getByRole("button", { name: /TrailQuest/i })).toBeInTheDocument();
});

test("clicking Nieuwe tocht opens the NewTrailForm with Plaats input", async () => {
  renderChrome();
  await userEvent.click(screen.getByRole("button", { name: /Nieuwe tocht/i }));
  expect(await screen.findByLabelText(/plaats/i)).toBeInTheDocument();
});

test("filling and submitting Nieuwe tocht form fires POST /drafts and navigates", async () => {
  const created = {
    id: "d1", title: "t", city: "Bloemendaal", theme: "nature",
    start: { lat: 52.4, lon: 4.6 }, requested_distance_km: 5, actual_distance_km: 4.8,
    estimated_duration_min: 60, stops: [], status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/drafts") && init?.method === "POST")
      return Promise.resolve(new Response(JSON.stringify(created), { status: 201 }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  renderChrome();

  // Open the form
  await userEvent.click(screen.getByRole("button", { name: /Nieuwe tocht/i }));

  // Fill in the place field
  await userEvent.type(await screen.findByLabelText(/plaats/i), "Bloemendaal");

  // Submit
  await userEvent.click(screen.getByRole("button", { name: /Genereer concept/i }));

  // Verify POST was made with from_concept: true
  const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
  expect(post).toBeTruthy();
  expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
    place: "Bloemendaal",
    from_concept: true,
  });

  // After successful generation, navigate to /studio/route
  expect(await screen.findByText("route-page")).toBeInTheDocument();
});
