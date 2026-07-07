import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { PoiPicker } from "./PoiPicker";
import type { POI } from "../../api/types";

afterEach(() => vi.restoreAllMocks());

const pois: POI[] = [
  { id: "p1", name: "Stadhuis", location: { lat: 52.38, lon: 4.63 }, facts: [{ key: "build_year", value: "1370", source: { name: "Wikidata", license: "CC0", reference: "q1" } }] },
  { id: "p2", name: "Vleeshal", location: { lat: 52.38, lon: 4.63 }, facts: [] },
  { id: "p3", name: "Al toegevoegd", location: { lat: 52.38, lon: 4.63 }, facts: [] },
];

test("lists candidates (excluding already-added) and picks one", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(pois), { status: 200 })));
  const onPick = vi.fn();
  render(
    <PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={["p3"]} onPick={onPick} onClose={() => {}} />,
  );

  expect(await screen.findByText("Stadhuis")).toBeInTheDocument();
  expect(screen.getByText("Vleeshal")).toBeInTheDocument();
  expect(screen.queryByText("Al toegevoegd")).not.toBeInTheDocument(); // excluded
  expect(screen.getByText(/geen feiten/i)).toBeInTheDocument(); // Vleeshal has no facts

  await userEvent.click(screen.getByText("Stadhuis"));
  expect(onPick).toHaveBeenCalledWith(pois[0], undefined);
});

test("shows a loading state before the POI fetch resolves", async () => {
  // a fetch that never resolves within the test → loading text stays
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={[]} onPick={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/laden/i)).toBeInTheDocument();
});

test("shows an error message when the POI fetch fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
  render(<PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={[]} onPick={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(/Kon POI's niet laden/i)).toBeInTheDocument();
});

test("renders 'Invoegen na' select with stop options when stops prop is provided", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
  const stops = [
    { order: 1, name: "Stadhuis" },
    { order: 2, name: "Vleeshal" },
  ];
  render(
    <PoiPicker
      start={{ lat: 52.38, lon: 4.63 }}
      excludeIds={[]}
      onPick={() => {}}
      onClose={() => {}}
      stops={stops}
    />,
  );

  const select = screen.getByRole("combobox", { name: /invoegen na/i });
  expect(select).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /einde/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /begin \(na start\)/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /na stop 1 — stadhuis/i })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /na stop 2 — vleeshal/i })).toBeInTheDocument();
});

test("'Invoegen na' select is not shown when stops prop is omitted", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
  render(
    <PoiPicker
      start={{ lat: 52.38, lon: 4.63 }}
      excludeIds={[]}
      onPick={() => {}}
      onClose={() => {}}
    />,
  );

  expect(screen.queryByRole("combobox", { name: /invoegen na/i })).not.toBeInTheDocument();
});
