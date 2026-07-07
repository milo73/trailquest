import { renderHook, waitFor } from "@testing-library/react-native";
import { distanceKm, useLocation } from "./useLocation";

test("distanceKm ~ known Haarlem span", () => {
  const d = distanceKm({ lat: 52.38, lon: 4.63 }, { lat: 52.39, lon: 4.64 });
  expect(d).toBeGreaterThan(1.1);
  expect(d).toBeLessThan(1.4);
});

test("useLocation reports the mocked position once granted", async () => {
  const { result } = await renderHook(() => useLocation());
  await waitFor(() => expect(result.current.position).not.toBeNull());
  expect(result.current.granted).toBe(true);
  expect(result.current.position).toEqual({ lat: 52.38, lon: 4.63 });
});
