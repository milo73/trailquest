# TrailQuester Mobile App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React Native (Expo) player app in `mobile/` that walks a published trail — browse → preview → navigate → stop → finish — against the existing FastAPI backend, with a native map + live GPS.

**Architecture:** Expo managed app; a phase-machine store (context+reducer, AsyncStorage-persisted) mirrors the web player; `react-native-maps` (Apple base + OSM tiles, no key) + `expo-location`; gating stays backend-driven. `react-native-maps`/`expo-location`/AsyncStorage are mocked in jest.

**Tech Stack:** Expo SDK (latest) + React Native + TypeScript; jest-expo + @testing-library/react-native.

## Global Constraints

- App lives in `mobile/` only; do NOT touch `backend/` or `frontend/`.
- Automated gate = `npx tsc --noEmit` + `npx jest` (from `mobile/`), with map/location/AsyncStorage mocked. NO simulator — on-device verification is the user's.
- Gating is backend-driven: obey `AnswerResult.unlocked_next`; never re-implement the gating engine. Points/badges are client-side (ported from web verbatim).
- UI strings Dutch. iOS-first (`PROVIDER_DEFAULT` = Apple Maps, no API key); OSM `UrlTile` overlay + "© OpenStreetMap contributors".
- Re-declare the API types from the web verbatim; `EXPO_PUBLIC_API_BASE` configures the backend host.
- Each task runs from `mobile/`. Commit on the current branch; do NOT branch.

---

### Task 1: Scaffold the Expo app + toolchain + mocks

**Files:** create `mobile/` via the Expo scaffolder, then `mobile/jest.config.js`, `mobile/jest.setup.js`, `mobile/__mocks__/`, `mobile/src/theme.ts`, `mobile/App.tsx`, `mobile/src/smoke.test.ts`.

**Interfaces:**
- Produces: a working `mobile/` where `npx tsc --noEmit` and `npx jest` pass; global mocks for `react-native-maps`, `expo-location`, `@react-native-async-storage/async-storage`; `theme` tokens.

- [ ] **Step 1: Scaffold + install (non-interactive)**

From the repo root:
```bash
npx create-expo-app@latest mobile --template blank-typescript
rm -rf mobile/.git        # we are already inside the trailquest repo
cd mobile
npx expo install react-native-maps expo-location @react-native-async-storage/async-storage
npm install --save-dev jest-expo @testing-library/react-native @types/jest react-test-renderer
```
If `create-expo-app` prompts, pass the name + template as shown (non-interactive). Verify `mobile/package.json`, `mobile/App.tsx`, `mobile/tsconfig.json` exist.

- [ ] **Step 2: Jest config + setup**

`mobile/jest.config.js`:
```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["@testing-library/react-native/extend-expect"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-maps|@react-native-async-storage/.*))",
  ],
};
```
Add to `mobile/package.json` scripts: `"test": "jest"`, `"typecheck": "tsc --noEmit"`.

`mobile/jest.setup.js`:
```js
/* global jest */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  watchPositionAsync: jest.fn(async (_opts, cb) => {
    cb({ coords: { latitude: 52.38, longitude: 4.63, accuracy: 5 } });
    return { remove: jest.fn() };
  }),
  Accuracy: { Balanced: 3 },
}));

jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const make = (testID) => (props) =>
    React.createElement(View, { testID, ...props }, props.children);
  const MapView = make("map");
  MapView.Marker = make("marker");
  MapView.Polyline = make("polyline");
  MapView.UrlTile = make("urltile");
  return {
    __esModule: true,
    default: MapView,
    Marker: MapView.Marker,
    Polyline: MapView.Polyline,
    UrlTile: MapView.UrlTile,
    PROVIDER_DEFAULT: "default",
  };
});
```

- [ ] **Step 3: theme + App stub + smoke test**

`mobile/src/theme.ts`:
```ts
export const colors = {
  terracotta: "#b5453a",
  terracottaDeep: "#963a30",
  navy: "#283a5e",
  white: "#ffffff",
  cream: "#f3ede0",
  paper: "#faf6ec",
  sand: "#ece2cf",
  border: "#e0d5bf",
};
export const spacing = (n: number) => n * 8;
```

Replace `mobile/App.tsx`:
```tsx
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { colors } from "./src/theme";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
      <Text style={{ color: colors.navy }}>TrailQuester</Text>
      <StatusBar style="auto" />
    </View>
  );
}
```

`mobile/src/smoke.test.ts`:
```ts
import { colors, spacing } from "./theme";

test("theme tokens exist", () => {
  expect(colors.terracotta).toBe("#b5453a");
  expect(spacing(2)).toBe(16);
});
```

- [ ] **Step 4: Verify the toolchain**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: tsc clean; jest runs and `smoke.test.ts` passes. If jest-expo config needs a tweak to run at all, fix it here (this task's whole purpose is a working toolchain). Report exact output.

- [ ] **Step 5: Commit**

```bash
cd /Users/milovandiest/trailquest && git add mobile && git commit -m "feat(mobile): scaffold Expo app + jest toolchain + mocks"
```
(Ensure `mobile/.gitignore` from the template ignores `node_modules`.)

---

### Task 2: API layer (types + client + trails)

**Files:** `mobile/src/api/types.ts`, `mobile/src/api/client.ts`, `mobile/src/api/trails.ts`, `mobile/src/api/trails.test.ts`.

**Interfaces:**
- Produces: `Trail`, `Stop`, `POI`, `Question`, `AnswerRequest`, `AnswerResult`, `GeoPoint`, `Theme`; `apiFetch`, `ApiError`; `listTrails()`, `getTrail(id)`, `submitAnswer(id, req)`.

- [ ] **Step 1: Types + client**

`mobile/src/api/types.ts` (verbatim from the web `frontend/src/api/types.ts` — copy `Theme`, `SourceLicense`, `Source`, `Fact`, `QuestionType`, `Question`, `GeoPoint`, `POI`, `Stop`, `Trail` (incl. `route_geometry?: GeoPoint[] | null`), `TrailRequest`, `AnswerRequest`, `AnswerResult`). Read that file and reproduce the interfaces exactly.

`mobile/src/api/client.ts`:
```ts
const BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
```

`mobile/src/api/trails.ts`:
```ts
import { apiFetch } from "./client";
import type { AnswerRequest, AnswerResult, Trail } from "./types";

export const listTrails = () => apiFetch<Trail[]>("/trails");
export const getTrail = (id: string) => apiFetch<Trail>(`/trails/${id}`);
export const submitAnswer = (id: string, req: AnswerRequest) =>
  apiFetch<AnswerResult>(`/trails/${id}/answer`, { method: "POST", body: JSON.stringify(req) });
```

- [ ] **Step 2: Write the test**

`mobile/src/api/trails.test.ts`:
```ts
import { ApiError } from "./client";
import { getTrail, listTrails, submitAnswer } from "./trails";

const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);
const fail = (status: number, detail: string) =>
  Promise.resolve({ ok: false, status, statusText: "e", json: async () => ({ detail }) } as Response);

afterEach(() => jest.restoreAllMocks());

test("listTrails GETs /trails", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockReturnValue(ok([{ id: "t1" }]));
  const trails = await listTrails();
  expect(trails).toEqual([{ id: "t1" }]);
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/trails$/);
});

test("submitAnswer POSTs the body", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockReturnValue(ok({ correct: true, unlocked_next: true, feedback: "ok" }));
  const r = await submitAnswer("t1", { stop_order: 1, answer: "x", attempt: 1 });
  expect(r.unlocked_next).toBe(true);
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toMatchObject({ stop_order: 1, answer: "x", attempt: 1 });
});

test("throws ApiError on non-2xx", async () => {
  jest.spyOn(global, "fetch").mockReturnValue(fail(404, "Trail not found"));
  await expect(getTrail("nope")).rejects.toBeInstanceOf(ApiError);
});
```

- [ ] **Step 3: Run + commit**

Run: `cd mobile && npx jest src/api && npx tsc --noEmit` → PASS/clean.
```bash
cd /Users/milovandiest/trailquest && git add mobile/src/api && git commit -m "feat(mobile): API client + trails endpoints"
```

---

### Task 3: gamification + location helpers

**Files:** `mobile/src/gamification.ts` (+ `.test.ts`), `mobile/src/location/useLocation.ts` (+ `distanceKm` + `.test.ts`).

**Interfaces:**
- Produces: `pointsFor`, `deriveBadges`, `SolveRecord`, `Badge`; `distanceKm(a,b)`, `useLocation()`.

- [ ] **Step 1: Port gamification**

`mobile/src/gamification.ts` — copy `frontend/src/quester/gamification.ts` verbatim (BASE_POINTS/FIRST_TRY_BONUS/NO_HINT_BONUS, `pointsFor`, `SolveRecord`, `Badge`, `THEME_BADGE`, `deriveBadges`); change the `Trail`/`QuestionType`/`Theme` import to `../api/types`. Copy the web's gamification test into `mobile/src/gamification.test.ts` (adjust import paths). Read the web file + its test and reproduce.

- [ ] **Step 2: Location helper + hook**

`mobile/src/location/useLocation.ts`:
```ts
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import type { GeoPoint } from "../api/types";

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useLocation() {
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setGranted(status === "granted");
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced }, (loc) =>
        setPosition({ lat: loc.coords.latitude, lon: loc.coords.longitude }),
      );
    })();
    return () => sub?.remove();
  }, []);

  return { position, granted };
}
```

`mobile/src/location/useLocation.test.ts`:
```ts
import { renderHook, waitFor } from "@testing-library/react-native";
import { distanceKm, useLocation } from "./useLocation";

test("distanceKm ~ known Haarlem span", () => {
  const d = distanceKm({ lat: 52.38, lon: 4.63 }, { lat: 52.39, lon: 4.64 });
  expect(d).toBeGreaterThan(1.1);
  expect(d).toBeLessThan(1.4);
});

test("useLocation reports the mocked position once granted", async () => {
  const { result } = renderHook(() => useLocation());
  await waitFor(() => expect(result.current.position).not.toBeNull());
  expect(result.current.granted).toBe(true);
  expect(result.current.position).toEqual({ lat: 52.38, lon: 4.63 });
});
```

- [ ] **Step 3: Run + commit**

Run: `cd mobile && npx jest src/gamification src/location && npx tsc --noEmit` → PASS/clean.
```bash
cd /Users/milovandiest/trailquest && git add mobile/src/gamification.ts mobile/src/gamification.test.ts mobile/src/location && git commit -m "feat(mobile): gamification + location helpers"
```

---

### Task 4: Store (phase machine + AsyncStorage)

**Files:** `mobile/src/store/QuesterStore.tsx` (+ `.test.tsx`).

**Interfaces:**
- Consumes: `Trail` (T2), `SolveRecord`/`pointsFor` (T3).
- Produces: `QuesterProvider`, `useQuester()` → `{ state, setTrail, startWalk, arrive, recordSolve, nextOrFinish, reset }`; `Phase = "browse"|"preview"|"navigate"|"stop"|"finish"`.

- [ ] **Step 1: Write the test**

`mobile/src/store/QuesterStore.test.tsx`:
```tsx
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
  const { result } = renderHook(() => useQuester(), { wrapper });
  act(() => result.current.setTrail(TRAIL));
  expect(result.current.state.phase).toBe("preview");
  expect(result.current.state.currentOrder).toBe(1);
  act(() => result.current.startWalk());
  expect(result.current.state.phase).toBe("navigate");
  act(() => result.current.arrive());
  expect(result.current.state.phase).toBe("stop");
  act(() => result.current.recordSolve(1, { type: "A", correct: true, attempt: 1, usedHint: false }));
  expect(result.current.state.points).toBe(18);
  act(() => result.current.nextOrFinish());
  expect(result.current.state).toMatchObject({ phase: "navigate", currentOrder: 2 });
  act(() => result.current.arrive());
  act(() => result.current.nextOrFinish()); // last stop -> finish
  expect(result.current.state.phase).toBe("finish");
});

test("persists to AsyncStorage and reloads", async () => {
  const first = renderHook(() => useQuester(), { wrapper });
  act(() => first.current.setTrail(TRAIL));
  await waitFor(async () => expect(await AsyncStorage.getItem("tq.quester")).toBeTruthy());
  const second = renderHook(() => useQuester(), { wrapper });
  await waitFor(() => expect(second.result.current.state.trail?.id).toBe("t1"));
});
```
(Note: `renderHook` returns `{ result }`; adjust the destructuring to your RNTL version — recent versions expose `result.current`.)

- [ ] **Step 2: Implement**

`mobile/src/store/QuesterStore.tsx` — a context + `useReducer`, hydrating from AsyncStorage on mount and persisting on change. Model the reducer on `frontend/src/quester/store.tsx`:
- `setTrail(trail)` → `{ phase: "preview", trail, currentOrder: trail.stops[0]?.order ?? 1, solves: {}, points: 0 }`.
- `startWalk()` → `{ phase: "navigate" }`.
- `arrive()` → `{ phase: "stop" }` (at `currentOrder`).
- `recordSolve(order, record)` → add `record` to `solves` + `points += pointsFor(record)`.
- `nextOrFinish()` → compute the next order after `currentOrder` from `trail.stops`; if none → `phase: "finish"`, else `{ phase: "navigate", currentOrder: next }`.
- `reset()` → back to `{ phase: "browse", trail: undefined, solves: {}, points: 0, currentOrder: 1 }`.
Persist the whole state to `AsyncStorage` key `tq.quester` in an effect (skip the first render), and hydrate via `AsyncStorage.getItem` in an effect on mount (merge over the default). Expose `useQuester()` throwing if used outside the provider.

- [ ] **Step 3: Run + commit**

Run: `cd mobile && npx jest src/store && npx tsc --noEmit` → PASS/clean.
```bash
cd /Users/milovandiest/trailquest && git add mobile/src/store && git commit -m "feat(mobile): QuesterStore phase machine + AsyncStorage"
```

---

### Task 5: Components (TrailMap + QuestionCard + shared UI)

**Files:** `mobile/src/components/TrailMap.tsx` (+ `.test.tsx`), `mobile/src/components/QuestionCard.tsx` (+ `.test.tsx`), `mobile/src/components/ui.tsx` (small `AppButton`, `Card`, `Badge` — theme-styled).

**Interfaces:**
- Consumes: mocked `react-native-maps` (T1), `Question`/`AnswerResult` (T2).
- Produces: `TrailMap`, `QuestionCard`, `AppButton`/`Card`/`Badge`.

- [ ] **Step 1: TrailMap**

`mobile/src/components/TrailMap.tsx`: a `MapView` (default import) with `provider={PROVIDER_DEFAULT}`, `style={{ flex: 1 }}`, `showsUserLocation={followUser}`; a `<UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />`; a `<Marker>` per stop (`coordinate={{latitude,longitude}}`, a small numbered child `View`/`Text`); a `<Polyline coordinates={line} strokeColor={colors.terracotta} strokeWidth={4} />` where `line` = `routeGeometry` mapped to `{latitude,longitude}` or the stop points; and a small absolute "© OpenStreetMap contributors" `Text`. Props `{ stops: {order,label,lat,lon}[]; routeGeometry?: GeoPoint[] | null; activeOrder?: number; followUser?: boolean }`. (No real `fitToCoordinates` needed for tests — call it in an `onMapReady`/ref effect for the device; guard for the mock.)

`mobile/src/components/TrailMap.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
import { TrailMap } from "./TrailMap";

const STOPS = [
  { order: 0, label: "S", lat: 52.38, lon: 4.63 },
  { order: 1, label: "1", lat: 52.39, lon: 4.64 },
];

test("renders a marker per stop + a polyline + OSM tiles", () => {
  render(<TrailMap stops={STOPS} routeGeometry={null} />);
  expect(screen.getAllByTestId("marker")).toHaveLength(2);
  expect(screen.getByTestId("polyline")).toBeTruthy();
  expect(screen.getByTestId("urltile")).toBeTruthy();
  expect(screen.getByText(/OpenStreetMap/)).toBeTruthy();
});
```

- [ ] **Step 2: QuestionCard**

`mobile/src/components/QuestionCard.tsx`: props `{ question: Question; submitting: boolean; result: AnswerResult | null; attempt: number; onSubmit: (answer: string) => void; onHint: () => void; hintShown: boolean }`. Renders the prompt; a `TextInput` (Dutch placeholder "Jouw antwoord") + an `AppButton` "Controleer" (calls `onSubmit`); for a gating type a "Hint" button when `question.hint`; shows `result.feedback` and, when present, `result.revealed_answer` ("Antwoord: …"). Type C shows a reflection prompt + "Deel" instead of a right/wrong input. Keep it presentational — the parent (StopScreen) owns attempts + the `submitAnswer` call.

`mobile/src/components/QuestionCard.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QuestionCard } from "./QuestionCard";

const Q = { type: "A", prompt: "Hoe hoog?", answer: "78", hint: "tel", gates: true } as const;

test("submits the typed answer", () => {
  const onSubmit = jest.fn();
  render(<QuestionCard question={Q} submitting={false} result={null} attempt={1} onSubmit={onSubmit} onHint={() => {}} hintShown={false} />);
  fireEvent.changeText(screen.getByPlaceholderText(/antwoord/i), "78");
  fireEvent.press(screen.getByText(/Controleer/i));
  expect(onSubmit).toHaveBeenCalledWith("78");
});

test("shows feedback + revealed answer", () => {
  render(<QuestionCard question={Q} submitting={false} result={{ correct: false, unlocked_next: true, revealed_answer: "78", feedback: "Het antwoord was: 78." }} attempt={3} onSubmit={() => {}} onHint={() => {}} hintShown />);
  expect(screen.getByText(/Het antwoord was: 78/)).toBeTruthy();
});
```

`mobile/src/components/ui.tsx`: `AppButton` (`{ title, onPress, disabled?, variant? }` → `Pressable` + `Text`, terracotta/navy), `Card` (`View` with paper bg + border), `Badge` (`{ label }` chip). Small; used by screens. Add a trivial `ui.test.tsx` asserting `AppButton` fires `onPress` and respects `disabled`.

- [ ] **Step 3: Run + commit**

Run: `cd mobile && npx jest src/components && npx tsc --noEmit` → PASS/clean.
```bash
cd /Users/milovandiest/trailquest && git add mobile/src/components && git commit -m "feat(mobile): TrailMap + QuestionCard + shared UI"
```

---

### Task 6: Screens + App phase switch

**Files:** `mobile/src/screens/{Browse,Preview,Navigate,Stop,Finish}Screen.tsx` (+ tests for Browse, Stop, Finish), `mobile/App.tsx` (phase switch).

**Interfaces:**
- Consumes: `useQuester` (T4), `listTrails/getTrail/submitAnswer` (T2), `TrailMap/QuestionCard/ui` (T5), `useLocation/distanceKm` (T3), `deriveBadges` (T3).

- [ ] **Step 1: Screens**

Build each screen (model the structure + Dutch copy on the web `frontend/src/quester/screens/*`; use the store actions from T4). Responsibilities:
- **BrowseScreen:** on mount `listTrails()` (loading/empty/error state); a `Card` per trail (`{city} · {theme} · {actual_distance_km} km · {stops.length} stops`) with an `AppButton` "Speel" → `getTrail(t.id)` then `setTrail`. Empty: "Nog geen gepubliceerde tochten."
- **PreviewScreen:** `TrailMap` (all stops, `routeGeometry`) + stats (afstand/duur/#stops) + attributions + `AppButton` "Start" → `startWalk()`.
- **NavigateScreen:** full-screen `TrailMap followUser` + header "Stop {idx}/{total}" + the next stop's POI name + (via `useLocation`+`distanceKm`) the distance to it + a "Je bent er bijna" hint under 0.05 km + `AppButton` "Ik ben er" → `arrive()`.
- **StopScreen:** the current stop's POI name, story, source badges; a `QuestionCard` for the primary question — owns `attempt` (1..3), `hintShown`, calls `submitAnswer(trail.id, {stop_order, answer, attempt, question_index: primary})`, stores the `AnswerResult`; on `result.unlocked_next` shows an `AppButton` "Volgende" → `recordSolve(order, {type, correct, attempt, usedHint: hintShown})` then `nextOrFinish()`. Bonus (non-primary) questions render below and never gate.
- **FinishScreen:** `points`, `deriveBadges(trail, Object.values(solves))` as `Badge`s, stats, `AppButton` "Nieuwe tocht" → `reset()`.

`mobile/App.tsx`:
```tsx
import { QuesterProvider, useQuester } from "./src/store/QuesterStore";
import { BrowseScreen } from "./src/screens/BrowseScreen";
import { PreviewScreen } from "./src/screens/PreviewScreen";
import { NavigateScreen } from "./src/screens/NavigateScreen";
import { StopScreen } from "./src/screens/StopScreen";
import { FinishScreen } from "./src/screens/FinishScreen";

function Flow() {
  const { state } = useQuester();
  switch (state.phase) {
    case "preview": return <PreviewScreen />;
    case "navigate": return <NavigateScreen />;
    case "stop": return <StopScreen />;
    case "finish": return <FinishScreen />;
    default: return <BrowseScreen />;
  }
}

export default function App() {
  return (
    <QuesterProvider>
      <Flow />
    </QuesterProvider>
  );
}
```

- [ ] **Step 2: Screen tests**

`mobile/src/screens/BrowseScreen.test.tsx` — mock `../api/trails` (`listTrails` → `[TRAIL]`, `getTrail` → TRAIL); render inside `QuesterProvider`; assert the city renders and pressing "Speel" transitions (a Preview-only element appears). `mobile/src/screens/StopScreen.test.tsx` — seed the store to a stop (setTrail+startWalk+arrive), mock `submitAnswer` → `{correct:true, unlocked_next:true, feedback:"Correct!"}`; type an answer, press "Controleer", assert "Volgende" appears; pressing it advances. `mobile/src/screens/FinishScreen.test.tsx` — seed solves+points, assert the score + a badge label render. Use the `TRAIL` fixture from the store test.

- [ ] **Step 3: Full gate**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: all pass/clean. Report the count.

- [ ] **Step 4: Commit**

```bash
cd /Users/milovandiest/trailquest && git add mobile/src/screens mobile/App.tsx && git commit -m "feat(mobile): screens + phase-switch app"
```

---

### Task 7: Verify + README + app config

- [ ] **App config:** ensure `mobile/app.config.ts` (or `app.json`) sets the iOS bundle id, app name "TrailQuester", and the `expo-location` plugin with a foreground permission string (`NSLocationWhenInUseUsageDescription`: "Om je route te volgen tijdens de speurtocht."). Verify `npx tsc --noEmit` still clean.
- [ ] **Full gate:** `cd mobile && npx jest && npx tsc --noEmit` — report the test count.
- [ ] **`mobile/README.md`:** what the app is (the TrailQuester player), the run steps (backend on `--host 0.0.0.0`, `EXPO_PUBLIC_API_BASE=http://<LAN-ip>:8000 npx expo start`, Expo Go on iOS), the test commands, and the deferred scope (geofence auto-arrival, offline answer eval, account, Android/Google key).
- [ ] Update the root `README.md` / `CLAUDE.md` one line: the mobile client now has an MVP in `mobile/` (Expo, iOS-first).
- [ ] Commit `docs(mobile): README + app config`.

## Self-review (completed during planning)

- **Spec coverage:** Expo scaffold + mocks → T1; API layer → T2; gamification + location → T3; store/phase-machine + AsyncStorage → T4; TrailMap (OSM tiles/markers/polyline) + QuestionCard → T5; 5 screens + phase switch → T6; app config + run docs → T7. Backend-driven gating (StopScreen obeys `AnswerResult`), points/badges (ported), on-device verification note all covered.
- **Placeholder scan:** T1–T4 carry full code/config; T5–T6 give component contracts + full tests + the web screens as the structural model (RN JSX not reproduced line-for-line, consistent with the test-as-contract approach).
- **Type consistency:** `apiFetch`/`ApiError`/`listTrails`/`getTrail`/`submitAnswer` (T2) used by store (T4) + screens (T6); store actions `setTrail/startWalk/arrive/recordSolve/nextOrFinish/reset` + `Phase` identical across T4 and App.tsx (T6); `TrailMap`/`QuestionCard` props (T5) match the screen callers (T6); `distanceKm`/`useLocation` (T3) used by NavigateScreen (T6); jest mocks' testIDs (T1) match the component tests (T5).
