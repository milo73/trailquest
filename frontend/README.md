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
        └── Validation.tsx   pre-publish validation screen — server-computed report (per-stop grounding, blocking/warning counts, can_publish); "Publiceer" button is disabled while blocking > 0; on success sets the draft to `review`
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
| Studio validation (`GET /drafts/{id}/validation`) | yes | — |
| Studio publish (`POST /drafts/{id}/publish`) | yes | — |

### Stop authoring

The Stop editor (`StopEditor.tsx`) now loads, edits, and persists a stop's story and question via the FastAPI backend:

- **Load/edit/save** — opening a stop populates the story and question fields from the draft stored on the server. Edits to either field autosave on blur via `PUT /drafts/{id}/stops/{order}` (body: `story`, `question`).
- **Grounded generation ("Regenereer")** — checking one or more facts in the facts panel and optionally picking a tone, then clicking "Regenereer", calls `POST /drafts/{id}/stops/{order}/generate` (body: `fact_keys`, `tone`). The response fills the story and question fields with LLM-generated text grounded in the selected facts only — the LLM is not allowed to invent facts outside the supplied set.
- **Tone selector** — a dropdown lets the author steer the register (`speels`, `zakelijk`, `kindvriendelijk`, `verhalend`). The selected tone is sent as the `tone` field in the generate request.
- **422 guard** — saving a gating question (Type A or D) with no stored answer returns a 422 from the backend; the editor surfaces this as a validation error so the author cannot accidentally create an unverifiable gate.

**Manual smoke** (requires `npm run dev` + backend running):

- Open `http://localhost:5173/studio` → click a draft → click a stop row to open the Stop editor
- Edit the story text; click outside the field (blur) → the change autosaves (reload confirms it persists)
- Check one or more facts in the facts panel; pick a tone from the tone selector; click "Regenereer" → the story and question fields fill with grounded content
- Reload the page — the generated story and question are retained on the server

---

### Studio route creation

The creator studio now manages real draft trails backed by the FastAPI backend:

- **Draft persistence** — "Nieuwe tocht maken" (`/studio`) calls `POST /drafts` to create a server-side draft and navigates to `/studio/route`. The draft is persisted on the server and survives a full browser reload.
- **POI catalog** — the "+ Stop toevoegen" picker fetches real Haarlem POIs from `GET /pois`. Without the backend running this call fails and the picker shows an empty list.
- **Live distance meter** — after every stop addition, removal, or reorder the editor calls `POST /routes/measure` and updates the km / min display. Distance is a walking-network estimate (haversine if OSRM is not configured).
- **Degraded offline state** — without the backend running, the studio dashboard and route editor show empty or error states for drafts (they degrade gracefully, they do not crash). The Stop editor and Validation screens remain fully functional on local state.

### Studio editor improvements

The route and stop editors have been extended with the following capabilities:

- **Inline rename** — the draft title in the Route editor is an editable field; changes autosave on blur via `PUT /drafts/{id}` (no separate save button required).
- **Clickable logo** — the TrailQuest logo in the studio shell is a link back to `/studio` (the dashboard).
- **Add-stop chooser** — clicking "+ Stop toevoegen" opens a two-tab chooser: a catalog picker that loads real Haarlem POIs from `GET /pois` (with loading and error states), and a custom-stop form (fields: name, optional lat/lon) that calls `POST /drafts/{id}/stops`.
- **Stop editor — prev/next pagination** — arrow buttons in the Stop editor navigate between stops in the current draft without returning to the Route editor.
- **Stop editor — "Terug naar route"** — a back link navigates to `/studio/route` with the current draft loaded.
- **Stop editor — Regenereer error feedback** — if `POST /drafts/{id}/stops/{order}/generate` fails, an inline error message is shown rather than silently failing.
- **Active stop survives reload** — the active stop's order is persisted to `localStorage` under the key `tq.studio.activeStop`; when `/studio/stop` is loaded the store restores it and re-fetches the draft so the editor resumes the correct stop after a hard reload.

**Manual smoke** (requires `npm run dev` + backend running):

- Open `http://localhost:5173/studio` → open a draft → rename the title in-place and click outside → the name updates (autosaved).
- Click "+ Stop toevoegen" → select a POI from the catalog picker → confirm it appears in the stop list.
- Open the chooser again → switch to the custom-stop tab → enter a name and optional coordinates → add the stop → confirm it appears in the list.
- Click a stop row → Stop editor opens; use the prev/next arrows to page through stops.
- Click "Terug naar route" → the Route editor reloads with the correct draft.
- Navigate directly to `http://localhost:5173/studio/stop` (hard reload) → confirm the editor restores the previously active stop.

---

### Studio — validation and publish

The Validation screen is now backed by the FastAPI backend. Clicking "Publiceren" in the Route editor navigates to `/studio/validation`, which calls `GET /drafts/{id}/validation` and displays a server-computed report.

**Blocking rules** (a draft cannot be published while any of these apply):

- Fewer than 2 stops
- A stop has incomplete content (empty story or question)
- A stop is factless (a custom stop with no grounded facts — no verifiable question can be generated)

**Warnings** (informational only; do not block publish):

- Trail distance is outside the recommended tolerance

When all blocking issues are resolved (`can_publish: true`) the "Publiceer" button becomes active. Clicking it calls `POST /drafts/{id}/publish`, which re-validates server-side; if any blocking issue arose since the last check the endpoint returns 409 and the screen shows an error. On success the draft status is set to `review` and the user is returned to the dashboard.

**Manual smoke** (requires `npm run dev` + backend running):

- Open `http://localhost:5173/studio` → open a draft → click "Publiceren" in the Route editor → the Validation screen loads showing real per-stop grounding from the server.
- Add a factless custom stop (custom-stop tab, no coordinates) → confirm the screen shows a blocking issue and the "Publiceer" button is disabled.
- Remove the factless stop → the blocking count drops to zero and "Publiceer" becomes active.
- Click "Publiceer" → the dashboard reloads and shows the trail card with status "In review".

---

## Automated smoke results

Run against commit on branch `feat/studio-validation`.

### Typecheck (`npm run typecheck`)

```
(no output — clean)
exit 0
```

### Tests (`npm test`)

```
Test Files  21 passed (21)
      Tests  63 passed (63)
   Duration  ~1.3s
```

Test files:
- `src/api/drafts.test.ts` (8)
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
- `src/studio/components/PoiPicker.test.tsx` (3)
- `src/studio/draftStore.test.tsx` (8)
- `src/studio/screens/Dashboard.test.tsx` (3)
- `src/studio/screens/RouteEditor.test.tsx` (5)
- `src/studio/screens/StopEditor.test.tsx` (11)
- `src/studio/screens/Validation.test.tsx` (2)
- `src/studio/StudioChrome.test.tsx` (1)
- `src/App.test.tsx` (1)

Note: React Router v6 emits two "Future Flag Warning" lines during studio and player tests (`v7_startTransition`, `v7_relativeSplatPath`). These are informational deprecation hints from the library, not test failures. Some tests also emit unhandled rejection noise ("Body has already been read") from mock Responses reused across fetch calls — this is pre-existing and does not indicate test failures.

### Build (`npm run build`)

```
vite v5.4.21 building for production...
68 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-DSq2xkZK.css    1.31 kB │ gzip:  0.64 kB
dist/assets/index-uIPGfuYn.js   257.10 kB │ gzip: 73.58 kB
built in 304ms
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
- [ ] Open Validation screen; the report loads with real per-stop grounding from the server; if no blocking issues, click "Publiceer" → draft status becomes "In review" on the dashboard

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
