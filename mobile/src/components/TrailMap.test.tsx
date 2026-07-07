import { render, screen } from "@testing-library/react-native";
import { TrailMap } from "./TrailMap";

const STOPS = [
  { order: 0, label: "S", lat: 52.38, lon: 4.63 },
  { order: 1, label: "1", lat: 52.39, lon: 4.64 },
];

test("renders a marker per stop + a polyline + OSM tiles", async () => {
  await render(<TrailMap stops={STOPS} routeGeometry={null} />);
  expect(screen.getAllByTestId("marker")).toHaveLength(2);
  expect(screen.getByTestId("polyline")).toBeTruthy();
  expect(screen.getByTestId("urltile")).toBeTruthy();
  expect(screen.getByText(/OpenStreetMap/)).toBeTruthy();
});
