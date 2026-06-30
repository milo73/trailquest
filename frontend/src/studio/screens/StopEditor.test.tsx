import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StopEditor, canGate } from "./StopEditor";
import { DraftProvider, useDraft } from "../draftStore";

test("canGate only allows A and D", () => {
  expect(canGate("A")).toBe(true);
  expect(canGate("D")).toBe(true);
  expect(canGate("B")).toBe(false);
  expect(canGate("C")).toBe(false);
});

test("selecting type B disables and forces off the gate toggle", async () => {
  render(
    <MemoryRouter>
      <DraftProvider>
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  const gate = screen.getByRole("switch", { name: /gaten/i });
  expect(gate).toBeChecked(); // starts as Type A, gate on
  await userEvent.selectOptions(screen.getByLabelText(/Vraagtype/i), "B");
  expect(gate).toBeDisabled();
  expect(gate).not.toBeChecked();
});

test("verhaal word count updates as you edit", async () => {
  render(
    <MemoryRouter>
      <DraftProvider>
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  const textarea = screen.getByLabelText(/Verhaal/i);
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "een twee drie");
  expect(screen.getByText(/3 woorden/)).toBeInTheDocument();
});

test("fact checkboxes are checked by default for the active POI's facts", async () => {
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return (
      <button
        onClick={async () => {
          await createDraft({ start: { lat: 52.38, lon: 4.63 } });
          setActiveStop(1);
        }}
      >
        seed
      </button>
    );
  }
  const draftWithFact = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{
      order: 1,
      poi: {
        id: "p-waag",
        name: "Waag",
        location: { lat: 52.38, lon: 4.63 },
        facts: [{
          key: "build_year",
          value: "1370",
          source: { name: "Wikidata", license: "CC0", reference: "https://www.wikidata.org/wiki/Q1234" },
        }],
      },
    }],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithFact), { status: 201 })));
  render(
    <MemoryRouter>
      <DraftProvider>
        <Seed />
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByText("seed"));
  // The fact value must appear
  expect(await screen.findByText("1370")).toBeInTheDocument();
  // The hidden checkbox input inside the label must be checked.
  // aria-label is on the <label> wrapper, so query the input directly via its
  // hidden checkbox role within that label element.
  const label = await screen.findByLabelText("1370 opnemen");
  // label is the <label> element itself; the checkbox input is its first child
  const input = label.querySelector("input[type='checkbox']");
  expect(input).not.toBeNull();
  expect(input as HTMLInputElement).toBeChecked();
});

test("shows the active draft stop's POI when one is selected", async () => {
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return (
      <button
        onClick={async () => {
          // stub fetch so createDraft returns a draft with our POI as stop 1
          await createDraft({ start: { lat: 52.38, lon: 4.63 } });
          setActiveStop(1);
        }}
      >
        seed
      </button>
    );
  }
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] } }],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 })));
  render(
    <MemoryRouter>
      <DraftProvider>
        <Seed />
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByText("seed"));
  const matches = await screen.findAllByText("Waag");
  expect(matches.length).toBeGreaterThan(0);
});

test("editing the story and blurring autosaves via PUT", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "Oud verhaal.", question: { type: "C", prompt: "Wat denk je?", gates: false } }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(draftWithStop), { status: 201 }))
    .mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  const textarea = await screen.findByLabelText("Verhaal");
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "Nieuw verhaal.");
  fireEvent.blur(textarea);
  await waitFor(() => {
    const putCall = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1/stops/1");
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1].body).story).toBe("Nieuw verhaal.");
  });
});

test("a Type-A question with no answer is blocked from saving", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: { type: "A", prompt: "Hoe hoog?", answer: "10", hint: null, gates: true } }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  const answerInput = await screen.findByLabelText("Antwoord");
  await userEvent.clear(answerInput);
  fireEvent.blur(answerInput);
  expect(await screen.findByText(/Antwoord verplicht/i)).toBeInTheDocument();
  // the save was blocked: no PUT to the stop content endpoint was made
  expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/stops/1")).length).toBe(0);
});

test("Regenereer generates from selected facts and fills the fields", async () => {
  const fact = { key: "build_year", value: "1370", source: { name: "Wikidata", license: "CC0", reference: "q1" } };
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [fact] }, story: "", question: null }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (String(url).endsWith("/generate"))
      return Promise.resolve(new Response(JSON.stringify({ story: "Gegenereerd verhaal over 1370.", question: { type: "A", prompt: "In welk jaar?", answer: "1370", hint: null, gates: true } }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(draftWithStop), { status: 201 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Regenereer|Genereren/i }));
  const textarea = await screen.findByLabelText("Verhaal");
  await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toContain("Gegenereerd verhaal"));
  // the generate call carried the selected fact key
  const genCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/generate"));
  expect(JSON.parse((genCall![1] as RequestInit).body as string).fact_keys).toEqual(["build_year"]);
});

test("prev/next pagination changes the active stop", async () => {
  const draftWithStops = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [
      { order: 1, poi: { id: "p1", name: "Eerste", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null },
      { order: 2, poi: { id: "p2", name: "Tweede", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null },
    ],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStops), { status: 201 })));
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  expect(await screen.findAllByText("Eerste")).not.toHaveLength(0);
  await userEvent.click(screen.getByLabelText("Volgende stop"));
  expect(await screen.findAllByText("Tweede")).not.toHaveLength(0);
});

test("a failed Regenereer shows an error message", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p1", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string) =>
    String(url).endsWith("/generate")
      ? Promise.resolve(new Response("boom", { status: 500 }))
      : Promise.resolve(new Response(JSON.stringify(draftWithStop), { status: 201 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Regenereer|Genereren/i }));
  expect(await screen.findByText(/Genereren mislukt/i)).toBeInTheDocument();
});

test("switching type A→C immediately saves with the NEW type, not the old one", async () => {
  // Start with a Type-A question (answer present so it's valid) and a fact so the
  // POI renders correctly. Switch to Type C via the select and assert the PUT body
  // carries question.type === "C", not the stale "A".
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{
      order: 1,
      poi: {
        id: "p-waag",
        name: "Waag",
        location: { lat: 52.38, lon: 4.63 },
        facts: [{
          key: "build_year",
          value: "1370",
          source: { name: "Wikidata", license: "CC0", reference: "https://www.wikidata.org/wiki/Q1234" },
        }],
      },
      story: "Oud gebouw.",
      question: { type: "A", prompt: "Wanneer gebouwd?", answer: "1370", hint: null, gates: true },
    }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(draftWithStop), { status: 201 }))
    .mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return (
      <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>
        seed
      </button>
    );
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  // Wait for stop to load (answer field visible when type is A)
  await screen.findByLabelText("Antwoord");

  // Switch type from A to C — this should immediately PUT with type "C"
  await userEvent.selectOptions(screen.getByLabelText(/Vraagtype/i), "C");

  await waitFor(() => {
    const putCalls = fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/drafts/d1/stops/1");
    expect(putCalls.length).toBeGreaterThan(0);
    const lastPut = putCalls[putCalls.length - 1];
    const body = JSON.parse(lastPut[1].body);
    expect(body.question.type).toBe("C");
  });
});
