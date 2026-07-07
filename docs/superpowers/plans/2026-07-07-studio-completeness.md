# Studio Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the High+Medium studio audit gaps: draft delete, theme editing, working "+ Nieuwe tocht", a player-preview modal, a real dashboard with working filters, stop insertion position, mock cleanup.

**Architecture:** One new backend endpoint (`DELETE /drafts/{id}` + `DraftStore.delete`); everything else is frontend against existing endpoints (`PUT /drafts/{id}` already supports `theme`; insertion reuses the `stop_poi_ids` save flow).

**Tech Stack:** FastAPI/pytest; Vite + React + TS + Vitest + RTL.

## Global Constraints

- Deleting a draft never touches `content_cache` (shared stop content) or `published_trails` (immutable snapshots — a live trail stays playable).
- Theme change is metadata-only; existing stop stories persist until regenerated (Dutch hint shown).
- UI strings Dutch; backend gate `pytest -q && ruff check . && ruff format --check . && mypy app`; frontend gate `npm test && npm run typecheck && npm run build`; no new `act(...)` warnings.
- Deferred (do NOT build): unpublish, auth, undo/redo, pagination, "Bibliotheek/Inzichten" tabs.

---

### Task 1: Backend — `DraftStore.delete` + `DELETE /drafts/{id}`

**Files:**
- Modify: `backend/app/cache/store.py` (ABC + `InMemoryDraftStore` + `FileDraftStore`)
- Modify: `backend/app/api/drafts.py`
- Test: `backend/tests/test_drafts_api.py`

**Interfaces:**
- Produces: `drafts.delete(draft_id) -> bool`; `DELETE /drafts/{id}` → 204 | 404.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_drafts_api.py`:
```python
def test_delete_draft_removes_it():
    d = client.post("/drafts", json={"start": {"lat": 52.3812, "lon": 4.6361}}).json()
    assert client.delete(f"/drafts/{d['id']}").status_code == 204
    assert client.get(f"/drafts/{d['id']}").status_code == 404


def test_delete_unknown_draft_is_404():
    assert client.delete("/drafts/nope").status_code == 404


def test_delete_draft_keeps_published_trail_playable(monkeypatch):
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service

    d = draft_service.create(DraftCreate(start=GeoPoint(lat=52.3812, lon=4.6361), from_concept=True))
    assert client.post(f"/drafts/{d.id}/publish").status_code == 200
    assert client.delete(f"/drafts/{d.id}").status_code == 204
    # the published snapshot is immutable — still playable after the draft is gone
    assert client.get(f"/trails/{d.id}").status_code == 200
```
(Match the file's existing client/fixture style; reuse its imports.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_drafts_api.py -q -k delete`
Expected: FAIL (405/no delete).

- [ ] **Step 3: Implement**

In `backend/app/cache/store.py` — add to the `DraftStore` ABC:
```python
    @abstractmethod
    def delete(self, draft_id: str) -> bool: ...
```
`InMemoryDraftStore`:
```python
    def delete(self, draft_id: str) -> bool:
        return self._records.pop(draft_id, None) is not None
```
`FileDraftStore`:
```python
    def delete(self, draft_id: str) -> bool:
        path = self._path(draft_id)
        if not path.exists():
            return False
        path.unlink()
        return True
```
In `backend/app/api/drafts.py`:
```python
@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: str) -> None:
    """Delete a draft. Shared stop content and published snapshots are untouched."""
    if not drafts.delete(draft_id):
        raise HTTPException(status_code=404, detail="Draft not found")
```
(Import `drafts` from `app.cache` if not already; it is used elsewhere in the module via `draft_service` — add a direct import or a `draft_service.delete(draft_id)` wrapper; prefer a `draft_service.delete` wrapper mirroring how other endpoints go through the service: `def delete(draft_id: str) -> bool: return drafts.delete(draft_id)`.)

- [ ] **Step 4: Full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app` → all green (run `ruff format .`/`ruff check --fix .` if flagged). Report count.

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(backend): DELETE /drafts/{id} + DraftStore.delete"
```

---

### Task 2: Frontend — delete draft (API + store + Dashboard UI)

**Files:**
- Modify: `frontend/src/api/drafts.ts` (`deleteDraft`)
- Modify: `frontend/src/studio/draftStore.tsx` (`removeDraft`)
- Modify: `frontend/src/studio/screens/Dashboard.tsx` (delete action + confirm dialog)
- Test: `frontend/src/studio/screens/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `DELETE /drafts/{id}` (Task 1).
- Produces: `deleteDraft(id)`; store `removeDraft(id: string) => Promise<void>`.

- [ ] **Step 1:** `api/drafts.ts`:
```ts
export const deleteDraft = (id: string) =>
  apiFetch<void>(`/drafts/${id}`, { method: "DELETE" });
```
Note: `apiFetch` parses JSON — a 204 has no body. Check `frontend/src/api/client.ts`; if it unconditionally `res.json()`s, guard: return `undefined` when `res.status === 204`.

- [ ] **Step 2:** `draftStore.tsx` — add `removeDraft(id)` to `DraftApi` + impl: call `deleteDraft(id)`; if the active `draft?.id === id`, clear it (`setDraft(undefined)` per the store's state shape) and remove the persisted active-stop key.

- [ ] **Step 3:** Dashboard — each real `DraftCard` gets a "Verwijderen" action (small ghost button/icon, `stopPropagation`). Clicking opens a Dutch confirm dialog (modal, CustomStopForm pattern): "Tocht verwijderen? Dit kan niet ongedaan worden." with buttons "Verwijderen" (calls `removeDraft(id)`, refreshes the list) and "Annuleren".

- [ ] **Step 4: Test** — add to `Dashboard.test.tsx` (existing fetch-stub pattern): render with one real draft; click "Verwijderen" → dialog appears; click "Annuleren" → card remains, no DELETE issued; click "Verwijderen" again + confirm → a `DELETE /drafts/d1` request fired and the card disappears.

- [ ] **Step 5:** Run `cd frontend && npm test -- Dashboard drafts && npm run typecheck` → green. Commit:
```bash
git add frontend/src && git commit -m "feat(frontend): delete draft with confirmation"
```

---

### Task 3: Theme editor (RouteEditor)

**Files:**
- Modify: `frontend/src/studio/draftStore.tsx` (`setTheme`)
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (~line 251: replace hardcoded "Historisch")
- Test: `frontend/src/studio/screens/RouteEditor.test.tsx`

**Interfaces:**
- Consumes: `updateDraft(id, { theme })` (exists; `DraftUpdate.theme` in types).
- Produces: store `setTheme(theme: Theme) => Promise<void>`.

- [ ] **Step 1:** Store action (mirror `renameDraft` at `draftStore.tsx:103`):
```ts
setTheme: async (theme) => {
  if (!draft) return;
  const saved = await updateDraft(draft.id, { theme });
  setDraft(saved);
},
```
- [ ] **Step 2:** RouteEditor: replace the hardcoded `Historisch` text (keep the icon) with a `<select aria-label="Thema" value={draft.theme} onChange={(e) => setTheme(e.target.value as Theme)}>` over the six themes with Dutch labels (historical→"Historisch", hidden_gems→"Verborgen parels", family→"Familie", architecture→"Architectuur", nature→"Natuur", mixed→"Gemengd"; extract the label map to a shared `frontend/src/studio/themeLabels.ts` and reuse it in `NewTrailForm` to stay DRY). Under it a small hint: "Bestaande verhalen veranderen pas na opnieuw genereren."
- [ ] **Step 3: Test** — RouteEditor.test: the select shows the draft's theme; `userEvent.selectOptions(..., "nature")` issues a PUT whose body contains `{"theme":"nature"}`; the hint text renders.
- [ ] **Step 4:** `npm test -- RouteEditor NewTrailForm && npm run typecheck` → green. Commit `feat(frontend): theme editor in route editor`.

---

### Task 4: Top-bar "+ Nieuwe tocht" opens NewTrailForm

**Files:**
- Modify: `frontend/src/studio/StudioChrome.tsx` (button at ~line 112)
- Test: create `frontend/src/studio/StudioChrome.test.tsx` (or extend an existing chrome/dashboard test)

- [ ] **Step 1:** StudioChrome: add `const [showNew, setShowNew] = useState(false)`; the button's `onClick={() => setShowNew(true)}` (replacing `navigate("/studio/route")`); render `{showNew && <NewTrailForm submitting={creating} onClose={() => setShowNew(false)} onSubmit={handleGenerate} />}` where `handleGenerate` mirrors the Dashboard's: `setCreating(true)` → `await createDraft(req)` (store action via `useDraft()`) → close + `navigate("/studio/route")`; rethrow errors; `finally` reset. (StudioChrome must be inside the DraftProvider — verify in `StudioApp.tsx`; it is, since screens use `useDraft`.)
- [ ] **Step 2: Test** — render the chrome (match how an existing screen test mounts routes/providers); click "Nieuwe tocht" → the form's "Plaats" field appears; fill + submit → POST /drafts fired with `from_concept: true`.
- [ ] **Step 3:** `npm test -- StudioChrome && npm run typecheck` → green. Commit `feat(frontend): top-bar Nieuwe tocht opens the concept form`.

---

### Task 5: Voorvertoning — TrailPreviewModal

**Files:**
- Create: `frontend/src/studio/components/TrailPreviewModal.tsx` (+ `.test.tsx`)
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (wire the button, ~line 138)

**Interfaces:**
- Produces: `TrailPreviewModal({ draft: DraftTrail; onClose: () => void })`.

- [ ] **Step 1: Component** — a backdrop + centered `PhoneFrame`-styled panel (`role="dialog"`, aria-label "Voorvertoning"): header "Zo ziet de speler het" + "Sluiten"; a fixed-height (≈260px) `TileMap` with `stops` (start `{order:0,label:"S"}` + each poi.location) and `routeGeometry={draft.route_geometry}`; below, a scrollable list — per stop: `“{order}. {poi.name}”`, story excerpt (`story ? story.slice(0,150) + (story.length>150 ? "…" : "") : "—"`), and the primary question prompt when `questions[primary_question_index]` exists. Read-only.
- [ ] **Step 2:** RouteEditor: `const [showPreview, setShowPreview] = useState(false)`; the Voorvertoning button gets `onClick={() => setShowPreview(true)}`; render the modal when open.
- [ ] **Step 3: Test** — `TrailPreviewModal.test.tsx`: fixture draft with 2 stops (one with story+primary question, one empty) → both POI names render, the excerpt renders, the empty stop shows "—", markers testid count = 3 (S + 2). RouteEditor test: clicking "Voorvertoning" shows the dialog.
- [ ] **Step 4:** `npm test -- TrailPreviewModal RouteEditor && npm run typecheck` → green. Commit `feat(frontend): player-preview modal in route editor`.

---

### Task 6: Real dashboard stats + working filters + mock cleanup

**Files:**
- Modify: `frontend/src/studio/screens/Dashboard.tsx`
- Delete: `frontend/src/studio/mock/trails.ts`, `frontend/src/studio/mock/validation.ts` (verify no other importers first: `grep -rn "mock/" frontend/src`)
- Test: `frontend/src/studio/screens/Dashboard.test.tsx`

- [ ] **Step 1:** Remove the `MOCK_TRAILS`/`MOCK_DASHBOARD_STATS` import + the mock card grid (`Dashboard.tsx:313`) + mock-based header/tiles (`:249-296`). Stat tiles become computed from the real `drafts` list: **Tochten** = count, **Live** = `status==="published"` count, **Concepten** = `status==="concept"` count, **Stops** = sum of `stops.length`. Header line: `{count} tochten · TrailQuest Studio voor Haarlem`. Remove the plays/rating/correctness tiles.
- [ ] **Step 2:** Filters: `const [filter, setFilter] = useState<"alle"|"published"|"concept"|"review">("alle")`; the chips set it (active chip styled as the current "Alle" is); the card grid renders `drafts.filter(d => filter==="alle" || d.status===filter)`.
- [ ] **Step 3:** `git rm` both mock files (after confirming zero remaining importers).
- [ ] **Step 4: Test** — Dashboard.test: fixture of 3 drafts (published/concept/review) → tiles show 3/1/1; clicking chip "Concept" leaves only the concept card; "Alle" restores. Update any existing test that asserted mock content.
- [ ] **Step 5:** FULL `npm test && npm run typecheck && npm run build` → green (mock deletions can break imports — fix all). Commit `feat(frontend): real dashboard stats + working filters; drop mocks`.

---

### Task 7: Stop insertion position

**Files:**
- Modify: `frontend/src/studio/draftStore.tsx` (`addStop`/`addCustomStop` gain `insertAfter?: number`)
- Modify: `frontend/src/studio/components/PoiPicker.tsx`, `frontend/src/studio/components/CustomStopForm.tsx` (an "Invoegen na" select)
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (pass stops into the pickers / thread the choice)
- Test: extend `frontend/src/studio/draftStore.test.tsx`

- [ ] **Step 1: Store** — `addStop(poi, insertAfter?: number)`: build the new stops array with the POI inserted after the stop with `order === insertAfter` (or append when undefined/`Infinity`), then `save({ ...draft, stops: renumber(next) })` (one PUT via the existing `stop_poi_ids` flow). `addCustomStop(body, insertAfter?)`: POST as today (backend appends), then — when `insertAfter` is set and not last — reorder the returned draft's stops to move the new last stop into position and `save` once.
- [ ] **Step 2: UI** — `PoiPicker` and `CustomStopForm` get an optional prop `stops: {order: number; name: string}[]` and render `<select aria-label="Invoegen na">` with options "Einde" (default), "Begin (na start)" (value 0), and each "Na stop {order} — {name}"; the chosen value is passed through `onPick`/`onSubmit` (extend those callback signatures with the insert position). RouteEditor threads it into the store calls.
- [ ] **Step 3: Test** — draftStore.test: with a 2-stop draft, `addStop(poi, 1)` issues a PUT whose `stop_poi_ids` places the new POI second (between the existing two); `addStop(poi)` appends. A PoiPicker test: the select renders the stop options.
- [ ] **Step 4:** `npm test -- draftStore PoiPicker CustomStopForm RouteEditor && npm run typecheck` → green. Commit `feat(frontend): choose insertion position for new stops`.

---

### Task 8: Verify + README

- [ ] Backend gate (`pytest -q && ruff check . && ruff format --check . && mypy app`) + frontend gate (`npm test && npm run typecheck && npm run build`) — report counts.
- [ ] `backend/README.md`: add the `DELETE /drafts/{id}` row (204; published snapshots unaffected). `frontend/README.md`: dashboard is real-data (stats/filters), draft delete, theme editing, Voorvertoning modal, insertion position; mocks removed.
- [ ] Commit `docs: studio completeness`.

## Self-review (completed during planning)

- **Spec coverage:** §1→T1+T2; §2→T3; §3→T4; §4→T5; §5→T6; §6→T7; §7→T6 (mock files); testing → per task + T8.
- **Placeholder scan:** T1 full code; T2–T7 exact files/lines + behavioral contracts + concrete tests; the `apiFetch` 204 caveat called out.
- **Type consistency:** `removeDraft`/`setTheme`/`addStop(poi, insertAfter?)` named consistently across store/UI tasks; `themeLabels.ts` shared T3↔NewTrailForm; `TrailPreviewModal` props match its RouteEditor caller; `deleteDraft` (T2) matches T1's endpoint.
