# TrailQuest Frontend

React + Vite + TypeScript single-page app. Serves two surfaces:

- `/play` — the **player app** (QuesterApp) — wired to the FastAPI backend
- `/studio` — the **creator studio** (StudioApp) — runs on mock data (one real call: "Genereer concept" hits `POST /trails`)

---

## Prerequisites

- **Node >= 20** (the repo currently uses Node 26)
- The Python backend virtual environment (for live player data — see below)

---

## Install and run

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Available scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server (port 5173, HMR) |
| `npm test` | Run Vitest test suite (non-watch) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` — type-check without emitting |
| `npm run build` | `tsc -b && vite build` — production bundle into `dist/` |
| `npm run preview` | Serve the `dist/` bundle locally |

---

## `/api` dev proxy

Vite proxies all `/api/*` requests to `http://127.0.0.1:8000` and strips the `/api` prefix. This means the frontend calls `/api/trails` and Vite rewrites it to `http://127.0.0.1:8000/trails` — the FastAPI backend receives a plain path.

Configuration lives in `vite.config.ts`:

```ts
proxy: {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
},
```

The proxy applies **only in development** (`npm run dev`). In production the frontend must be served alongside the backend or through a reverse proxy that handles `/api` routing.

---

## Running with the backend (live player data)

```bash
# terminal 1 — from the repo root:
source backend/.venv/bin/activate && PYTHONPATH=backend uvicorn app.main:app --port 8000

# terminal 2:
cd frontend && npm run dev

# then open:
#   http://localhost:5173/play    — player app (live trail generation)
#   http://localhost:5173/studio  — creator studio (mock data)
```

Without the backend running, visiting `/play` and clicking "Genereer speurtocht" will show the degrade error message (this is expected — the backend is required for trail generation). The `/studio` dashboard and route editor will show empty or error states for drafts; the Stop editor and Validation screens still render on local state. The backend is required for draft creation, the POI picker, and the distance meter.

---

## Architecture orientation

```
src/
├── design-system/
│   ├── tokens.css           design tokens (colour, spacing, typography)
│   ├── fonts.ts             font definitions
│   └── primitives/          shared UI primitives
│       ├── Button, Card, Chip, Chip, EyebrowLabel
│       ├── MapCanvas        SVG stand-in for tile map (MVP)
│       ├── PhoneFrame       chrome wrapper
│       ├── SegmentedControl
│       ├── SourceBadge      renders provenance attribution
│       └── StatTile
│
├── api/
│   ├── types.ts             Trail, Stop, Question, AnswerResult shapes
│   │                        (mirrors backend schemas.py)
│   ├── client.ts            fetch wrapper (throws on non-2xx)
│   └── trails.ts            typed API calls: generateTrail, checkAnswer
│
├── quester/                 player app
│   ├── gamification.ts      pointsFor, deriveBadges, SolveRecord (client-side)
│   ├── store.tsx            React context + useReducer — setTrail, goToStop,
│   │                        recordSolve, arriveAtNextOrFinish, reset
│   ├── QuesterApp.tsx       router + provider root
│   └── screens/
│       ├── Configure.tsx    distance / theme picker → generateTrail
│       ├── Preview.tsx      trail overview before starting
│       ├── Navigate.tsx     "Ik ben er" arrival screen
│       ├── Stop.tsx         story + question + answer + gating (3 attempts)
│       └── Finish.tsx       points tally + badges earned
│
└── studio/                  creator studio
    ├── mock/                seed data (trails.ts, stop.ts, validation.ts)
    ├── StudioChrome.tsx     shell nav (Dashboard / Route / Stop / Validation)
    ├── StudioApp.tsx        router root
    └── screens/
        ├── Dashboard.tsx    trail cards + stats
        ├── RouteEditor.tsx  stop list + reorder controls
        ├── StopEditor.tsx   stop detail — content, question type, gate toggle
        │                    (Type B forces gate off per content-accuracy constraint)
        └── Validation.tsx   pre-publish checks → publish to moderation queue
```

### What is backend-wired vs. client-side / mock

| Feature | Wired to backend | Client-side / mock |
|---|---|---|
| Trail generation (`POST /trails`) | yes | — |
| Answer checking (`POST /trails/{id}/stops/{idx}/answer`) | yes | — |
| Points and badges | — | yes (`gamification.ts`) |
| Star rating | — | yes (local state) |
| Studio drafts (`POST/GET/PUT /drafts`) | yes | — |
| Studio POI catalog (`GET /pois`) | yes | — |
| Studio route measurement (`POST /routes/measure`) | yes | — |
| Studio "Genereer concept" | yes | — |

### Studio route creation

The creator studio now manages real draft trails backed by the FastAPI backend:

- **Draft persistence** — "Nieuwe tocht maken" (`/studio`) calls `POST /drafts` to create a server-side draft and navigates to `/studio/route`. The draft is persisted on the server and survives a full browser reload.
- **POI catalog** — the "+ Stop toevoegen" picker fetches real Haarlem POIs from `GET /pois`. Without the backend running this call fails and the picker shows an empty list.
- **Live distance meter** — after every stop addition, removal, or reorder the editor calls `POST /routes/measure` and updates the km / min display. Distance is a walking-network estimate (haversine if OSRM is not configured).
- **Degraded offline state** — without the backend running, the studio dashboard and route editor show empty or error states for drafts (they degrade gracefully, they do not crash). The Stop editor and Validation screens remain fully functional on local state.

---

## Automated smoke results

Run against commit on branch `feat/studio-route-creation`.

### Typecheck (`npm run typecheck`)

```
(no output — clean)
exit 0
```

### Tests (`npm test`)

```
Test Files  20 passed (20)
      Tests  38 passed (38)
   Duration  ~1.2s
```

Test files:
- `src/api/drafts.test.ts` (3)
- `src/api/trails.test.ts` (2)
- `src/quester/gamification.test.ts` (5)
- `src/quester/store.test.tsx` (3)
- `src/quester/QuesterApp.test.tsx` (1)
- `src/quester/screens/Configure.test.tsx` (1)
- `src/quester/screens/Navigate.test.tsx` (1)
- `src/quester/screens/Preview.test.tsx` (1)
- `src/quester/screens/Stop.test.tsx` (2)
- `src/design-system/primitives/Button.test.tsx` (1)
- `src/design-system/primitives/MapCanvas.test.tsx` (1)
- `src/design-system/primitives/SegmentedControl.test.tsx` (1)
- `src/design-system/primitives/SourceBadge.test.tsx` (2)
- `src/studio/components/PoiPicker.test.tsx` (1)
- `src/studio/draftStore.test.tsx` (3)
- `src/studio/screens/Dashboard.test.tsx` (2)
- `src/studio/screens/RouteEditor.test.tsx` (2)
- `src/studio/screens/StopEditor.test.tsx` (4)
- `src/studio/screens/Validation.test.tsx` (1)
- `src/App.test.tsx` (1)

Note: React Router v6 emits two "Future Flag Warning" lines during studio and player tests (`v7_startTransition`, `v7_relativeSplatPath`). These are informational deprecation hints from the library, not test failures.

### Build (`npm run build`)

```
vite v5.4.21 building for production...
68 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-DSq2xkZK.css    1.31 kB │ gzip:  0.64 kB
dist/assets/index-Cx8AmG5x.js   245.90 kB │ gzip: 71.26 kB
built in 305ms
exit 0
```

Output directory: `frontend/dist/`

---

## Manual smoke checklist

Run these manually after `npm run dev` with the backend running (see above).

### Player happy path

- [ ] Open `http://localhost:5173/play`
- [ ] Select a distance and theme; click "Genereer speurtocht"
- [ ] Trail preview appears with real POI stops from the backend
- [ ] Click "Start" to begin; map/navigate screen shows
- [ ] Click "Ik ben er" to arrive at the first stop
- [ ] Read the story and answer the question
  - Correct answer: advances to next stop (or finish)
  - Wrong answer: feedback shown; after 3 attempts the answer is revealed and progress continues (stops are not skippable — PRD §19)
- [ ] Complete all stops; finish screen shows points earned and any badges

### Studio — existing trails

- [ ] Open `http://localhost:5173/studio`
- [ ] Dashboard shows existing draft trail cards with stats (from server)
- [ ] Click a trail card → Route editor shows the stop list; use move-up/down controls to reorder — distance meter updates after each change
- [ ] Open Stop editor for a stop; change question type to **Type B** — verify the "Gate" toggle disables automatically
- [ ] Open Validation screen; review pre-publish warnings; click "Publiceer" → confirmation shown

### Studio — route creation (new)

- [ ] Open `http://localhost:5173/studio`
- [ ] Click "Nieuwe tocht maken" — navigates to `/studio/route` with an empty draft
- [ ] Click "+ Stop toevoegen" — a picker dialog opens and lists real Haarlem POIs fetched from `GET /pois`
- [ ] Select two POIs — they appear in the stop list and the distance/duration meter shows a non-zero value from `POST /routes/measure`
- [ ] Reorder the stops using the move-up/down controls — the meter updates after each change
- [ ] Remove a stop — meter updates
- [ ] Click a stop row to open the Stop editor for that stop
- [ ] Reload the page (`F5`) — the draft reloads from the server and the stop list is intact
- [ ] Navigate back to `/studio` — the draft appears in the dashboard card list
