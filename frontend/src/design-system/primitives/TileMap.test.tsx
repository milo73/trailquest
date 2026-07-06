import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TileMap } from "./TileMap";

const STOPS = [
  { order: 0, label: "S", lat: 52.38, lon: 4.63 },
  { order: 1, label: "1", lat: 52.39, lon: 4.64 },
  { order: 2, label: "2", lat: 52.4, lon: 4.65 },
];

test("renders a marker per stop and an OSM attribution", () => {
  render(<TileMap stops={STOPS} />);
  expect(screen.getAllByTestId("marker")).toHaveLength(3);
  expect(screen.getByTestId("tile").getAttribute("data-attribution")).toMatch(/OpenStreetMap/i);
  // labels live in the divIcon html
  expect(screen.getByText("S")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("polyline uses route geometry when provided", () => {
  render(<TileMap stops={STOPS} routeGeometry={[{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }, { lat: 7, lon: 8 }]} />);
  expect(screen.getByTestId("polyline").getAttribute("data-count")).toBe("4");
});

test("polyline falls back to the stop points when geometry is null", () => {
  render(<TileMap stops={STOPS} routeGeometry={null} />);
  expect(screen.getByTestId("polyline").getAttribute("data-count")).toBe("3");
});

test("adds a user marker when showUserDot with an active stop", () => {
  render(<TileMap stops={STOPS} activeOrder={1} showUserDot />);
  expect(screen.getAllByTestId("marker")).toHaveLength(4); // 3 stops + user
});
