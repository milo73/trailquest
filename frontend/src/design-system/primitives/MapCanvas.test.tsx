import { render } from "@testing-library/react";
import { MapCanvas, projectStops } from "./MapCanvas";

test("projectStops fits real coordinates to the canvas bounding box (lat inverted)", () => {
  const stops = [
    { order: 0, label: "S", lat: 52.3, lon: 4.6 }, // SW corner
    { order: 1, label: "1", lat: 52.4, lon: 4.8 }, // NE corner
  ];
  const pts = projectStops(stops, 400, 800);
  // east (higher lon) -> larger x; north (higher lat) -> smaller y (inverted)
  expect(pts[1].x).toBeGreaterThan(pts[0].x);
  expect(pts[1].y).toBeLessThan(pts[0].y);
  // within padded bounds
  for (const p of pts) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(400);
  }
});

test("projectStops falls back to waypoints when no coordinates are given", () => {
  const pts = projectStops(
    [
      { order: 1, label: "1" },
      { order: 2, label: "2" },
    ],
    360,
    764,
  );
  expect(pts).toHaveLength(2);
  expect(pts[0].x).not.toBeNaN();
});

test("renders one labelled pin per stop", () => {
  const { container } = render(
    <MapCanvas
      stops={[
        { order: 1, label: "S" },
        { order: 2, label: "2" },
        { order: 3, label: "3" },
      ]}
      activeOrder={2}
    />,
  );
  // each pin label is an SVG <text>
  const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
  expect(labels).toEqual(expect.arrayContaining(["S", "2", "3"]));
});
