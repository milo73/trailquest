# TrailQuest frontend — TrailQuester & Trail Creator (design)

**Date:** 2026-06-25
**Status:** Approved design, pre-implementation
**Scope:** Build the two front-end apps from the supplied mockups (`TrailQuest UI.dc.html`,
`design_users.md`, `design_creators.md`) as a single Vite + React web app, wired to the
existing FastAPI backend.

## 1. Goal

Implement two apps against the provided designs:

- **TrailQuester** — the MVP mobile player flow (configure → preview → navigate → stop → finish),
  rendered in a phone frame at mobile width.
- **Trail Creator** — the post-MVP web studio (dashboard → route editor → stop editor →
  pre-publish validation), full-width web.

Both share one visual language (the "Atlas" editorial style: DM Serif Display headers,
DM Sans body, Spline Sans Mono labels, terracotta `#b5453a` + navy `#283a5e` on cream).

The player's **core loop is fully wired to the real backend**; gamification embellishments and
the entire studio run on client-side / mock data behind a typed seam (see §6).

## 2. Decisions (locked)

- **Platform:** React + Vite + TypeScript, single web app. (Diverges from PRD §19's
  "React Native" player decision; chosen because the mockups are HTML/CSS and the goal is
  working, demoable apps fast. A monorepo / RN split can come later.)
- **Scope:** both apps, all 9 screens.
- **Data:** wired to the existing FastAPI backend for trail generation, fetch, and answering;
  client-side/mock for the gaps in §6.
- **Structure:** single Vite app, route-split (`/play/*`, `/studio/*`), shared
  `design-system/` and `api/`. (Approach A over monorepo / two-apps.)
- **Language:** Dutch UI, matching the mockups and Haarlem-first launch.
- **No backend changes.** The existing pytest suite stays green, untouched.

## 3. Project structure

```
frontend/
  index.html
  package.json            # vite, react, react-router-dom, typescript, vitest, @testing-library/react
  vite.config.ts          # dev proxy: /api → http://127.0.0.1:8000
  .env                    # VITE_API_BASE=/api
  src/
    main.tsx              # router root: /play/* and /studio/*
    design-system/
      tokens.css          # CSS custom properties (colors, fonts, radii, shadows, keyframes)
      fonts.ts            # Google Fonts link set
      primitives/         # Button, Card, Chip, SourceBadge, StatTile, EyebrowLabel,
                          # SegmentedControl, PhoneFrame, MapCanvas
    api/
      client.ts           # fetch wrapper + ApiError
      types.ts            # mirrors backend schemas.py
      trails.ts           # createTrail, getTrail, submitAnswer
    quester/              # /play/*
      QuesterApp.tsx      # flow state machine + localStorage persistence
      screens/            # Configure, Preview, Navigate, Stop, Finish
      gamification.ts     # client-side points + badge derivation (mirrors backend rule)
    studio/               # /studio/*
      StudioApp.tsx
      screens/            # Dashboard, RouteEditor, StopEditor, Validation
      mock/               # dashboard cards, validation report fixtures
```

One `npm run dev`. The Vite dev server proxies `/api` to the running FastAPI backend, so there
are no CORS concerns and no backend CORS config is required.

## 4. Design system

Values are lifted directly from the mockups (they are internally consistent), not reinvented.

**Tokens (`tokens.css`):**

- Colors: `--tq-terracotta:#b5453a`, `--tq-terracotta-deep:#963a30`, `--tq-navy:#283a5e`,
  `--tq-ink:#211f1b`, `--tq-cream:#f3ede0`, `--tq-paper:#faf6ec`, `--tq-sand:#ece2cf`,
  `--tq-border:#e0d5bf`, `--tq-muted:#8a7f6d`; accents `--tq-green:#6f8a4f` / `#e7eed7`
  (grounded/ok), `--tq-gold:#c5912f` / `#f8efda` (warning); source-badge blues for OSM.
- Fonts: `--tq-serif:'DM Serif Display'`, `--tq-sans:'DM Sans'`, `--tq-mono:'Spline Sans Mono'`,
  display `'Bricolage Grotesque'` (wordmark).
- Radii, the two signature shadows (phone bezel, web card), keyframes `tqpulse` (geofence ping)
  and `tqdash` (animated route dashes).

**Primitives:**

- `Button` (primary terracotta / secondary outline / ghost), `Chip` (theme + status pills),
  `SourceBadge` (Wikidata green / Wikipedia gold / OSM blue — carries the §10 attribution
  contract into the UI), `StatTile`, `Card`, `EyebrowLabel` (mono uppercase), `SegmentedControl`.
- `PhoneFrame` — the `#1b1a17` bezel + status bar wrapper for every player screen.
- `MapCanvas` — one parameterized React component that renders the stylized SVG atlas map
  (roads, water, parks, dashed route, numbered stop pins, pulsing "you are here" dot) from a list
  of stops. Reused by player screens, the studio route editor, and the studio player-preview.

## 5. API layer

`src/api/types.ts` mirrors `backend/app/models/schemas.py`: `Trail`, `Stop`, `POI`, `Question`
(`type` A/B/C/D, `gates`, `answer`, `hint`), `Fact`, `Source`, `AnswerResult`, `Theme`, `GeoPoint`.

Three real calls (`src/api/trails.ts`):

- `createTrail({ start, distance_km, theme })` → `POST /trails` → `Trail` (201)
- `getTrail(id)` → `GET /trails/{id}` → `Trail`
- `submitAnswer(id, { stop_order, answer, attempt })` → `POST /trails/{id}/answer` → `AnswerResult`

**Gating contract is honored exactly as the backend dictates.** The client reads
`question.gates`, `AnswerResult.unlocked_next`, and `AnswerResult.revealed_answer`; it never
re-derives gating rules or decides correctness itself. The 3-attempts-then-reveal flow and the
Type-B honor reveal come straight from `AnswerResult`. This preserves the central content-accuracy
constraint (CLAUDE.md / PRD §8) on the client side: generated content can never become a gate.

`client.ts` is a thin `fetch` wrapper that throws a typed `ApiError` on non-2xx; screens surface a
degrade-not-break message (PRD §13).

## 6. Backend-gap handling (client-side, by decision)

Four things the mockups show that the backend does not expose. All handled client-side for now;
each behind a typed seam so it can later swap to a real endpoint.

| Design feature | Backend today | Plan |
|---|---|---|
| Running points total (`320 PTN`, `480 punten`) | `gamification_service.points_for()` exists but is **not** in `AnswerResult` | Compute in `quester/gamification.ts`, mirroring the rule exactly: 10 base, +5 first attempt, +3 no-hint, 0 on reveal/incorrect. The client already tracks `attempt` and `used_hint` locally. |
| Badges on completion (Historicus, Stadskenner, Speurneus…) | none | Client-side derivation from the finished trail (theme + perfect-solve counts) via a small rules table in `gamification.ts`. |
| Star rating / CSAT on finish | no endpoint | Local-only: captured in component state, no-op submit with an explicit `TODO` marker. |
| Entire Trail Creator (dashboard, create/edit/validate/publish, auth) | none | `studio/mock/` fixtures behind an `api/`-shaped interface. **One real reuse:** the "Generate a concept" start path calls the real `POST /trails` to produce an editable skeleton (the design's intent). |

The player's core loop (generate → preview → navigate → answer/gate → finish) is fully real; only
the embellishments and the post-MVP studio run on client/mock data.

## 7. TrailQuester player flow (`/play/*`)

`QuesterApp.tsx` is a flow state machine over five linear, non-skippable screens (PRD §19):

- **Configure** — location (GPS via `navigator.geolocation` is the working path; Zoeken/Kaart are
  stubbed to the Grote Markt default), distance buttons (2/5/10/15/custom), 6-theme grid. Defaults
  pre-filled (Haarlem, 5 km, Historisch) so "verras me" is one tap. Calls `createTrail`.
- **Preview** — `MapCanvas` loop + stat tiles from the real `Trail`; Start / "Opnieuw genereren"
  (re-calls `createTrail`). Loading state during generation.
- **Navigate** — `MapCanvas` + progress bar (stop N/total), next-stop card (distance/time),
  traffic-safety note, persistent **"Ik ben er"** button (geofence is simulated by the button in
  the web build), live points pill.
- **Stop** — grounded, AI-marked story + `SourceBadge`s + the question. Answer field calls
  `submitAnswer`; feedback/hint/reveal are driven entirely by `AnswerResult`; "poging N van 3";
  Type-B honor reveal; "Klopt dit feit niet?" feedback button (local). Next stop unlocks only when
  `unlocked_next` is true.
- **Finish** — score, derived badges, walked stats, star rating, Delen / Nieuwe tocht.

Active trail + progress persist to `localStorage` (mirrors the PRD's local-cache-of-active-trail),
so a reload resumes.

## 8. Trail Creator studio (`/studio/*`)

Four routed pages, full-width, same design system:

- **Dashboard** — stat tiles + trail cards (concept / live / in-review) from `studio/mock/`,
  "Nieuwe tocht".
- **RouteEditor** — `MapCanvas` + draggable stop list, distance-tolerance meter, validation chips.
  Reorder/add/remove updates the list (distance recompute mocked client-side). "Generate concept"
  hits real `POST /trails`.
- **StopEditor** (the heart) — locked **Feiten** zone (facts + `SourceBadge`, selectable not
  editable) vs. editable **Verhaal** zone (AI-marked; regenerate stubbed) vs. **Opdracht** builder
  showing the A/B/C/D classification and gating toggle. The UI makes the verifiability rule visible
  and prevents setting an unverifiable (Type-B) question as a gate. Right rail = live player
  preview reusing the real Stop screen in a small `PhoneFrame`.
- **Validation** — pre-publish checklist (grounding / walkability / distance / tone) + per-stop
  grounding summary + "Publiceren naar moderatie", from a mock validation report.

## 9. Testing

Vitest + React Testing Library — logic over pixels:

- `gamification.ts` — points rule (mirrors backend `points_for`) + badge derivation.
- `api/` — request shape + error handling against a mocked `fetch`.
- Player flow gating — Type-A wrong→hint→reveal→unlock; Type-B honor reveal; Type-C pass-through;
  next stop stays locked until `unlocked_next`.
- A couple of smoke renders per screen.

## 10. Out of scope

- Backend changes of any kind (points in `AnswerResult`, badges/rating/Creator endpoints, auth).
- Real geocoding/search and real map tiles (the stylized SVG `MapCanvas` stands in).
- React Native build, deploy pipeline, monorepo extraction.
- Real moderation/publish, versioning, and analytics for the studio.

These are explicitly deferred; the typed seams (`api/`, `studio/mock/`, `gamification.ts`) leave a
clean path to each.
