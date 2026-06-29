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
  expect(onPick).toHaveBeenCalledWith(pois[0]);
});
