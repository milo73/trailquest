import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QuesterProvider, useQuester } from "./QuesterStore";
import type { Trail } from "../api/types";

const TRAIL = {
  id: "t1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 4.8,
  estimated_duration_min: 60, start: { lat: 52.38, lon: 4.63 }, attributions: [], route_geometry: null,
  stops: [
    { id: "a", order: 1, poi: { id: "p1", name: "A", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s1", questions: [{ type: "C", prompt: "?", gates: true }], primary_question_index: 0 },
    { id: "b", order: 2, poi: { id: "p2", name: "B", location: { lat: 52.39, lon: 4.64 }, facts: [] }, story: "s2", questions: [{ type: "C", prompt: "?", gates: true }], primary_question_index: 0 },
  ],
} as unknown as Trail;

const wrapper = ({ children }: { children: React.ReactNode }) => <QuesterProvider>{children}</QuesterProvider>;

beforeEach(() => AsyncStorage.clear());

test("full flow: setTrail -> startWalk -> arrive -> next -> finish, with points", async () => {
  // RNTL v14: renderHook is async; result.current updated via useEffect, so await act for each dispatch
  const { result } = await renderHook(() => useQuester(), { wrapper });
  await act(async () => { result.current.setTrail(TRAIL); });
  expect(result.current.state.phase).toBe("preview");
  expect(result.current.state.currentOrder).toBe(1);
  await act(async () => { result.current.startWalk(); });
  expect(result.current.state.phase).toBe("navigate");
  await act(async () => { result.current.arrive(); });
  expect(result.current.state.phase).toBe("stop");
  await act(async () => { result.current.recordSolve(1, { type: "A", correct: true, attempt: 1, usedHint: false }); });
  expect(result.current.state.points).toBe(18);
  await act(async () => { result.current.nextOrFinish(); });
  expect(result.current.state).toMatchObject({ phase: "navigate", currentOrder: 2 });
  await act(async () => { result.current.arrive(); });
  await act(async () => { result.current.nextOrFinish(); }); // last stop -> finish
  expect(result.current.state.phase).toBe("finish");
});

test("persists to AsyncStorage and reloads", async () => {
  const first = await renderHook(() => useQuester(), { wrapper });
  await act(async () => { first.result.current.setTrail(TRAIL); });
  await waitFor(async () => expect(await AsyncStorage.getItem("tq.quester")).toBeTruthy());
  const second = await renderHook(() => useQuester(), { wrapper });
  await waitFor(() => expect(second.result.current.state.trail?.id).toBe("t1"));
});
