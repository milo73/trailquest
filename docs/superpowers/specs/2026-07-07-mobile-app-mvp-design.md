# TrailQuester mobile app — MVP (map-centric) (design)

**Date:** 2026-07-07
**Status:** Approved design, pre-implementation
**Scope:** The **first slice** of the React Native player app ("TrailQuester") that people use to
walk a route on their phone. Map-centric: a native map + live GPS from the start. Mirrors the existing
web player flow against the same FastAPI backend.

## Context

The mobile client does not exist yet (`CLAUDE.md:10`; PRD §19 locks **React Native**). The web player
(`frontend/src/quester/`) already implements the full flow — `browse → preview → navigate → stop →
finish` — against the backend (`GET /trails`, `GET /trails/{id}`, `POST /trails/{id}/answer`). The
mobile app re-implements that flow natively, adding a real map, live GPS, and an on-device cache of the
active trail (PRD §11). Gating stays **backend-driven** (`AnswerResult.unlocked_next`); the client is a
"dumb" renderer of what the server decides.

## Locked decisions

- **Toolchain:** Expo (managed). App lives in a new `mobile/` workspace; does not touch `backend/` or
  `frontend/`.
- **Test platform:** iOS via Expo Go → `react-native-maps` with the **default provider (Apple Maps, no
  API key)** + an **OSM `UrlTile`** overlay (matches the web look; "© OpenStreetMap contributors").
- **Verification reality:** `react-native-maps`/`expo-location` do not run in jest. Automated gate =
  `tsc --noEmit` + `jest` (jest-expo + RNTL) with the map/location **mocked**; the real map + GPS are
  verified by the user on-device via Expo Go.
- **This slice includes:** the 5 screens, native map, live GPS position + distance-to-next, manual
  "Ik ben er" arrival, backend-driven gating (3 attempts → reveal), points/badges, AsyncStorage cache.
- **Deferred (later slices):** true background geofence auto-arrival (C); client-side offline answer
  evaluation / full offline hardening (C); optional account + server-side history sync (D); Android
  (needs a Google Maps key); app-store builds (D).
- PRD §19 honoured: guest mode (no account), gating 3 attempts then reveal, stops not skippable/linear,
  distance-based, OSM for tiles/POIs. UI strings Dutch.

## Architecture

```
mobile/
  app.config.ts            Expo config (name, iOS bundle id, expo-location plugin + permission strings)
  package.json             expo, react-native, react-native-maps, expo-location,
                           @react-native-async-storage/async-storage, jest-expo, @testing-library/react-native
  tsconfig.json · babel.config.js · jest.config.js
  src/
    api/
      types.ts             Trail/Stop/POI/Question/AnswerResult/GeoPoint/Theme (re-declared from web)
      client.ts            apiFetch(path, init?) using EXPO_PUBLIC_API_BASE; ApiError on non-2xx
      trails.ts            listTrails(), getTrail(id), submitAnswer(id, req)
    store/
      QuesterStore.tsx     Context + reducer: phase machine + AsyncStorage persistence
    gamification.ts        pointsFor, deriveBadges, SolveRecord, Badge (ported from web verbatim)
    location/
      useLocation.ts       expo-location permission + watchPositionAsync; distanceKm(a,b) haversine
    components/
      TrailMap.tsx         react-native-maps wrapper (OSM tiles, markers, polyline, user dot, fit)
      QuestionCard.tsx     one question: input + attempts + hint + feedback
      Badge/Stat/Button    small shared UI (theme tokens)
    screens/
      BrowseScreen.tsx · PreviewScreen.tsx · NavigateScreen.tsx · StopScreen.tsx · FinishScreen.tsx
    App.tsx                QuesterProvider + phase switch (mirrors web QuesterApp)
    theme.ts               colors (terracotta #b5453a, navy #283a5e, cream/paper) + spacing
  __mocks__/               react-native-maps + expo-location test doubles (or in jest setup)
```

### Store + phase machine (`store/QuesterStore.tsx`)

Mirrors `frontend/src/quester/store.tsx`. State: `{ phase, trail?, currentOrder, solves: Record<number,
SolveRecord>, points }`. Phases: `"browse" | "preview" | "navigate" | "stop" | "finish"` (default
`browse`; no `configure` in this slice — self-generate is a web feature, deferred). Actions:
`setTrail(trail)` (→ preview, seeds currentOrder to first stop, resets solves/points), `startWalk()`
(→ navigate), `arrive()` (→ stop at currentOrder), `recordSolve(order, record)` (adds points via
`pointsFor`), `nextOrFinish()` (→ navigate at next order, or finish), `reset()` (→ browse). Persisted to
**AsyncStorage** under `tq.quester` (JSON), restored on launch → an interrupted walk resumes. Navigation
is a **phase switch in `App.tsx`** (no react-navigation) — mirrors the web, fewer deps, testable.

### API (`src/api/`)

`types.ts` re-declares the web types verbatim (`Trail` incl. `route_geometry?: GeoPoint[] | null`,
`Stop`, `POI`, `Question{type,prompt,answer?,hint?,gates}`, `AnswerRequest`, `AnswerResult{correct,
unlocked_next,revealed_answer?,feedback}`, `Theme`). `client.ts`: `const BASE = process.env
.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000"`; `apiFetch` wraps `fetch`, throws `ApiError` on
non-2xx. `trails.ts`: `listTrails()`, `getTrail(id)`, `submitAnswer(id, {stop_order, answer, attempt,
question_index?})`. Native `fetch` is not subject to CORS, so no backend CORS change is needed — the
backend must simply be reachable on the LAN (`uvicorn --host 0.0.0.0`) and `EXPO_PUBLIC_API_BASE` set to
`http://<LAN-ip>:8000`.

### Map (`components/TrailMap.tsx`)

`<MapView provider={PROVIDER_DEFAULT}>` (Apple base on iOS) filling its container, with:
- `<UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />` (OSM raster) and a small
  "© OpenStreetMap contributors" attribution label.
- A `<Marker>` per stop (numbered divIcon-style via a custom marker view; start = "S").
- A `<Polyline>` from `trail.route_geometry` (`{lat,lon}[]` → `{latitude,longitude}[]`) or the ordered
  stop points when `route_geometry` is null.
- `showsUserLocation` (live GPS dot) — enabled in Navigate.
- On mount / stop change, `fitToCoordinates(points, {edgePadding})`.
Props: `{ stops: {order,label,lat,lon}[]; routeGeometry?: GeoPoint[] | null; activeOrder?: number;
followUser?: boolean }`. Used by Preview (static overview) and Navigate (live).

### Location (`location/useLocation.ts`)

`useLocation()` requests foreground permission (`Location.requestForegroundPermissionsAsync`), starts
`watchPositionAsync`, returns `{ position: {lat,lon} | null, permission, error }`. `distanceKm(a, b)` is
a pure haversine helper (unit-tested). Navigate uses it to show distance to the next stop + a proximity
hint ("Je bent er bijna" under a threshold); the **manual "Ik ben er" button** remains the arrival
trigger this slice.

### Screens (mirror the web 1:1)

- **BrowseScreen:** `listTrails()` (loading/empty/error); a card per trail (`city · theme · km · N
  stops`) → "Speel" `getTrail(id)` → `setTrail`. Empty: "Nog geen gepubliceerde tochten."
- **PreviewScreen:** `TrailMap` overview + stats (afstand, duur, #stops) + attributions + "Start" →
  `startWalk()`.
- **NavigateScreen:** full-screen live `TrailMap` + header "Stop N / M" + next POI name + distance +
  "Ik ben er" → `arrive()`.
- **StopScreen:** POI name, story, source badges, the primary gated `QuestionCard` (input, attempt
  counter 1..3, hint button, feedback from `AnswerResult`); optional bonus questions (never gate). On
  `AnswerResult.unlocked_next`: `recordSolve(...)` then a "Volgende" action → `nextOrFinish()`.
- **FinishScreen:** score (`points`), `deriveBadges(trail, solves)`, stats, "Nieuwe tocht" → `reset()`.

## Gating (backend-driven, unchanged rules)

The client submits `{stop_order, answer, attempt}` and obeys the `AnswerResult`: `correct`,
`unlocked_next` (progress gate), `revealed_answer` (shown after 3 attempts or honor-system), `feedback`
(Dutch, from the server). Type A/D gate on correctness (3 attempts → reveal + proceed); B is honor-system
(instant reveal, proceeds); C always passes. The client renders `Question.gates` and never re-implements
the gating engine. `pointsFor({correct, attempt, usedHint})` scores locally (10 + 5 first-try + 3
no-hint), as on the web.

## Testing

- **jest-expo + @testing-library/react-native**; `tsc --noEmit` for types.
- **Mock `react-native-maps`** (MapView/Marker/Polyline/UrlTile → simple RN views exposing props) and
  **`expo-location`** (fixed permission + position) — a `__mocks__` dir or jest `setupFiles`.
- Unit: `store` reducer (phase transitions, solves→points, persistence round-trip via a mocked
  AsyncStorage), `gamification` (port the web tests), `distanceKm` (known haversine values), `api/trails`
  (mocked fetch → typed results, ApiError on non-2xx).
- Component (RNTL, map/location mocked): Browse lists + plays; Stop submits an answer and advances on
  `unlocked_next` (mock `submitAnswer`), shows reveal after 3 attempts; Finish shows score + badges;
  Navigate renders the next stop + "Ik ben er".
- **On-device (user):** the real map tiles, GPS dot, distance, and Expo Go run — outside the automated
  gate.

## How the user runs it

1. Backend reachable on the LAN: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (with `poi_source
   =live`, an LLM, and `routing_provider=osrm` for the route line).
2. `cd mobile && npm install && EXPO_PUBLIC_API_BASE=http://<LAN-ip>:8000 npx expo start`; open in Expo
   Go on the iPhone (same Wi-Fi).

## Out of scope (this slice)

Configure/self-generate flow; background geofence auto-arrival; client-side offline answer evaluation;
account/login + server-side history sync; Android (Google Maps key); push notifications; app-store
builds; deep links; i18n beyond Dutch.
