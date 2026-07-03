# Creator Grounding Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a creator ground a custom stop by pasting a Wikipedia/Wikidata link or QID — a new `grounding_service` fetches Wikidata facts + Wikipedia background so the stop carries real facts instead of being factless.

**Architecture:** A new `wikipedia.fetch_wikidata_qid` closes the Wikipedia→QID gap; `grounding_service.resolve_reference`/`build_grounded_poi` assemble a grounded `POI` (reusing the existing Wikidata/Wikipedia clients), degrading to a factless POI on any failure; `add_custom_stop` uses it when a `source_ref` is given; the studio custom-stop form gains a link field.

**Tech Stack:** Python/FastAPI/Pydantic/httpx/pytest; Vite + React + TypeScript + Vitest + RTL.

## Global Constraints

- **Degrade, don't break (PRD §13):** unresolvable reference or any `ClientError` → a factless POI (no exception, no 500).
- **Retrieved ground truth:** facts carry `Source(name="Wikidata", license=CC0, reference=f"wikidata:{qid}")`; background carries `Source(name="Wikipedia", license=CC-BY-SA, reference=<url>)` — never invent facts. Identical to `poi_service._fetch_live`.
- **Grounding adds facts + background, not questions.** No auto-question on ingest; the creator generates it later.
- **Location stays creator-supplied** (creator `lat`/`lon` or draft start); no Wikidata coordinate extraction.
- Offline-safe (all HTTP mocked in tests via `monkeypatch.setattr(<module>.httpx, "get", …)`); backend CI green (`ruff check`, `ruff format --check`, `mypy app`, `pytest`); UI strings Dutch.
- Frontend: existing suites stay green; `npm run typecheck` clean; no new `act(...)` warnings.

---

### Task 1: Client — `wikipedia.fetch_wikidata_qid`

**Files:**
- Modify: `backend/app/clients/wikipedia.py`
- Test: `backend/tests/test_clients.py` (add cases)

**Interfaces:**
- Produces: `wikipedia.fetch_wikidata_qid(title: str, lang: str = "en", timeout: float = 30.0) -> str | None`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_clients.py` (reuse the existing `_FakeResponse`):
```python
def test_wikipedia_fetch_qid_returns_wikibase_item(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"query": {"pages": {"123": {"pageprops": {"wikibase_item": "Q42"}}}}}
    monkeypatch.setattr(wikipedia.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    assert wikipedia.fetch_wikidata_qid("Grote Kerk", "nl") == "Q42"


def test_wikipedia_fetch_qid_none_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"query": {"pages": {"123": {"title": "X"}}}}
    monkeypatch.setattr(wikipedia.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    assert wikipedia.fetch_wikidata_qid("X") is None


def test_wikipedia_fetch_qid_raises_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wikipedia.httpx, "get", lambda *a, **k: _FakeResponse({}, status=500))
    with pytest.raises(ClientError):
        wikipedia.fetch_wikidata_qid("X")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -k fetch_qid -q`
Expected: FAIL (`fetch_wikidata_qid` not defined).

- [ ] **Step 3: Implement**

In `backend/app/clients/wikipedia.py`, add a module-level constant and the function:
```python
_ACTION_API = "https://{lang}.wikipedia.org/w/api.php"


def fetch_wikidata_qid(title: str, lang: str = "en", timeout: float = 30.0) -> str | None:
    """Resolve a Wikipedia article title to its Wikidata QID (pageprops.wikibase_item)."""
    try:
        resp = httpx.get(
            _ACTION_API.format(lang=lang),
            params={
                "action": "query",
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "redirects": "1",
                "titles": title,
                "format": "json",
            },
            timeout=timeout,
            headers=_HEADERS,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Wikipedia QID lookup failed for {title!r}: {exc}") from exc

    for page in data.get("query", {}).get("pages", {}).values():
        qid = page.get("pageprops", {}).get("wikibase_item")
        if qid:
            return str(qid)
    return None
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -k fetch_qid -q && ruff check app && mypy app/clients/wikipedia.py`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/wikipedia.py backend/tests/test_clients.py
git commit -m "feat(backend): wikipedia.fetch_wikidata_qid (page -> QID)"
```

---

### Task 2: `grounding_service`

**Files:**
- Create: `backend/app/services/grounding_service.py`
- Test: `backend/tests/test_grounding_service.py`

**Interfaces:**
- Consumes: `wikipedia.fetch_wikidata_qid` (Task 1), `wikidata.fetch_entity`, `wikipedia.fetch_summary`.
- Produces: `grounding_service.resolve_reference(ref: str) -> str | None`; `grounding_service.build_grounded_poi(ref: str, *, name: str | None = None, location: GeoPoint) -> POI`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_grounding_service.py`:
```python
import pytest

from app.clients import ClientError, wikidata, wikipedia
from app.clients.wikidata import EntityData
from app.clients.wikipedia import WikipediaSummary
from app.models.schemas import GeoPoint
from app.services import grounding_service

LOC = GeoPoint(lat=52.38, lon=4.63)


def test_resolve_bare_qid():
    assert grounding_service.resolve_reference("Q42") == "Q42"


def test_resolve_wikidata_url():
    assert grounding_service.resolve_reference("https://www.wikidata.org/wiki/Q42") == "Q42"


def test_resolve_wikipedia_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(wikipedia, "fetch_wikidata_qid", lambda title, lang="en", **k: "Q99")
    assert grounding_service.resolve_reference("https://nl.wikipedia.org/wiki/Grote_Kerk") == "Q99"


def test_resolve_unresolvable_returns_none():
    assert grounding_service.resolve_reference("not a reference") is None


def test_build_grounded_poi_has_wikidata_facts_and_background(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(wikidata, "fetch_entity", lambda qid: EntityData(facts={"build_year": "1520"}, enwiki_title="Grote Kerk"))
    monkeypatch.setattr(wikipedia, "fetch_summary", lambda title, **k: WikipediaSummary(extract="Een kerk.", url="https://nl.wikipedia.org/wiki/Grote_Kerk"))
    poi = grounding_service.build_grounded_poi("Q42", name=None, location=LOC)
    assert poi.id == "wikidata:Q42"
    assert poi.name == "Grote Kerk"
    assert poi.facts[0].key == "build_year" and poi.facts[0].source.name == "Wikidata"
    assert poi.background == "Een kerk."


def test_build_grounded_poi_degrades_to_factless_on_client_error(monkeypatch: pytest.MonkeyPatch):
    def _boom(qid):
        raise ClientError("down")
    monkeypatch.setattr(wikidata, "fetch_entity", _boom)
    poi = grounding_service.build_grounded_poi("Q42", name="Mijn plek", location=LOC)
    assert poi.facts == [] and poi.id.startswith("custom:") and poi.name == "Mijn plek"


def test_build_grounded_poi_unresolvable_is_factless():
    poi = grounding_service.build_grounded_poi("garbage", name=None, location=LOC)
    assert poi.facts == [] and poi.id.startswith("custom:")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_grounding_service.py -q`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement**

`backend/app/services/grounding_service.py`:
```python
"""Turn a creator-supplied reference (Wikipedia/Wikidata link or QID) into a
grounded POI — Wikidata facts (CC0) + Wikipedia background (CC BY-SA), reusing the
same retrieval pipeline as the live POI source. Degrades to a factless POI on any
failure (PRD §13)."""

from __future__ import annotations

import re
import uuid
from urllib.parse import unquote

from app.clients import ClientError, wikidata, wikipedia
from app.config import settings
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense

_WIKIPEDIA_URL = re.compile(r"https?://(\w+)\.wikipedia\.org/wiki/([^?#]+)", re.IGNORECASE)
_QID = re.compile(r"Q\d+", re.IGNORECASE)


def resolve_reference(ref: str) -> str | None:
    """Resolve a reference to a Wikidata QID, or None. Never raises."""
    ref = ref.strip()
    if not ref:
        return None
    match = _WIKIPEDIA_URL.match(ref)
    if match:
        lang, raw_title = match.group(1), match.group(2)
        title = unquote(raw_title).replace("_", " ")
        try:
            return wikipedia.fetch_wikidata_qid(title, lang)
        except ClientError:
            return None
    qid = _QID.search(ref)  # bare QID or a wikidata.org URL containing one
    return qid.group(0).upper() if qid else None


def _factless(name: str | None, location: GeoPoint) -> POI:
    return POI(id=f"custom:{uuid.uuid4()}", name=name or "Nieuwe stop", location=location, facts=[])


def build_grounded_poi(ref: str, *, name: str | None = None, location: GeoPoint) -> POI:
    qid = resolve_reference(ref)
    if qid is None:
        return _factless(name, location)
    try:
        entity = wikidata.fetch_entity(qid)
    except ClientError:
        return _factless(name, location)

    source = Source(name="Wikidata", license=SourceLicense.CC0, reference=f"wikidata:{qid}")
    facts = [Fact(key=k, value=v, source=source) for k, v in entity.facts.items()]

    background: str | None = None
    background_source: Source | None = None
    if entity.enwiki_title:
        try:
            summary = wikipedia.fetch_summary(entity.enwiki_title, timeout=settings.http_timeout)
        except ClientError:
            summary = None
        if summary is not None:
            background = summary.extract
            background_source = Source(
                name="Wikipedia", license=SourceLicense.CC_BY_SA, reference=summary.url
            )

    return POI(
        id=f"wikidata:{qid}",
        name=name or entity.enwiki_title or "Nieuwe stop",
        location=location,
        facts=facts,
        background=background,
        background_source=background_source,
    )
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_grounding_service.py -q && ruff check app && mypy app/services/grounding_service.py`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/grounding_service.py backend/tests/test_grounding_service.py
git commit -m "feat(backend): grounding_service (reference -> grounded POI)"
```

---

### Task 3: `CustomStopRequest.source_ref` + `add_custom_stop` + drafts API

**Files:**
- Modify: `backend/app/models/schemas.py` (`CustomStopRequest`)
- Modify: `backend/app/services/draft_service.py` (`add_custom_stop`)
- Modify: `backend/app/api/drafts.py` (`create_custom_stop`)
- Test: the existing custom-stop test file (find it: `grep -rl add_custom_stop backend/tests`) — extend it.

**Interfaces:**
- Consumes: `grounding_service.build_grounded_poi` (Task 2).
- Produces: `CustomStopRequest{name: str | None, lat, lon, source_ref: str | None}`; `add_custom_stop(draft_id, *, name=None, lat=None, lon=None, source_ref=None)`.

- [ ] **Step 1: Write the failing test**

Add to the file that tests `add_custom_stop` (backend seed set is offline; grounding will resolve a bare QID and hit `wikidata.fetch_entity` — monkeypatch it to stay offline):
```python
def test_add_custom_stop_with_source_ref_is_grounded(monkeypatch):
    from app.clients import wikidata
    from app.clients.wikidata import EntityData
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service, grounding_service

    monkeypatch.setattr(wikidata, "fetch_entity", lambda qid: EntityData(facts={"build_year": "1520"}, enwiki_title=None))
    # avoid a real Wikipedia call for background (enwiki_title=None already skips it)
    draft = draft_service.create(DraftCreate(start=GeoPoint(lat=52.38, lon=4.63)))
    updated = draft_service.add_custom_stop(draft.id, name="Mijn plek", source_ref="Q42")
    assert updated is not None
    stop = updated.stops[-1]
    assert stop.poi.id == "wikidata:Q42"
    assert stop.poi.facts and stop.poi.facts[0].key == "build_year"


def test_add_custom_stop_without_source_ref_is_factless(monkeypatch):
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service

    draft = draft_service.create(DraftCreate(start=GeoPoint(lat=52.38, lon=4.63)))
    updated = draft_service.add_custom_stop(draft.id, name="Leeg")
    assert updated.stops[-1].poi.facts == [] and updated.stops[-1].poi.id.startswith("custom:")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest <that test file> -q`
Expected: FAIL (`add_custom_stop` has no `source_ref`).

- [ ] **Step 3: Implement**

In `backend/app/models/schemas.py`, replace `CustomStopRequest`:
```python
class CustomStopRequest(BaseModel):
    name: str | None = None
    lat: float | None = None
    lon: float | None = None
    source_ref: str | None = None
```

In `backend/app/services/draft_service.py`, add `grounding_service` to the `from app.services import …` line, and replace `add_custom_stop`:
```python
def add_custom_stop(
    draft_id: str,
    *,
    name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    source_ref: str | None = None,
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    location = GeoPoint(
        lat=lat if lat is not None else draft.start.lat,
        lon=lon if lon is not None else draft.start.lon,
    )
    if source_ref:
        poi = grounding_service.build_grounded_poi(source_ref, name=name, location=location)
    else:
        poi = POI(id=f"custom:{uuid.uuid4()}", name=name or "Nieuwe stop", location=location, facts=[])
    draft.stops.append(DraftStop(order=len(draft.stops) + 1, poi=poi))
    _measure(draft)
    drafts.put(draft)
    return draft
```

In `backend/app/api/drafts.py`, update `create_custom_stop` to pass the new fields:
```python
    draft = draft_service.add_custom_stop(
        draft_id, name=body.name, lat=body.lat, lon=body.lon, source_ref=body.source_ref
    )
```

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count. If `ruff format --check .` flags files run `ruff format .`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/draft_service.py backend/app/api/drafts.py backend/tests/
git commit -m "feat(backend): custom stop grounding via source_ref"
```

---

### Task 4: Frontend — custom-stop link field

**Files:**
- Modify: `frontend/src/api/types.ts` (`CustomStopRequest`)
- Modify: `frontend/src/studio/components/CustomStopForm.tsx`
- Test: `frontend/src/studio/components/CustomStopForm.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `CustomStopRequest.source_ref` (Task 3 wire shape).
- Produces: a link input on the custom-stop form; `source_ref` in the submitted body; name optional when a link is given.

- [ ] **Step 1: Update the type**

In `frontend/src/api/types.ts`, change `CustomStopRequest` to:
```ts
export interface CustomStopRequest { name?: string; lat?: number; lon?: number; source_ref?: string; }
```

- [ ] **Step 2: Add the failing test**

Read the current `CustomStopForm.tsx` first. Create/extend `frontend/src/studio/components/CustomStopForm.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CustomStopForm } from "./CustomStopForm";

test("submitting a Wikipedia/Wikidata link includes source_ref and allows an empty name", async () => {
  const onSubmit = vi.fn();
  render(<CustomStopForm start={{ lat: 52.38, lon: 4.63 }} onSubmit={onSubmit} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText(/link of qid/i), "Q42");
  await userEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ source_ref: "Q42" }));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- CustomStopForm`
Expected: FAIL (no link input; submit disabled without a name).

- [ ] **Step 4: Implement**

In `frontend/src/studio/components/CustomStopForm.tsx`:
- Extend the local body interface: `interface CustomStopBody { name?: string; lat?: number; lon?: number; source_ref?: string; }`.
- Add `const [sourceRef, setSourceRef] = useState("");`.
- Add an input (with the other fields) labelled "Wikipedia/Wikidata-link of QID":
```tsx
<input
  id="custom-stop-source"
  aria-label="Wikipedia/Wikidata-link of QID"
  type="text"
  value={sourceRef}
  onChange={(e) => setSourceRef(e.target.value)}
  placeholder="https://nl.wikipedia.org/wiki/… of Q42"
  style={{ height: 38, padding: "0 10px", border: "1px solid var(--tq-border)", borderRadius: 8, font: "400 14px/1 var(--tq-sans)", color: "var(--tq-ink)", background: "var(--tq-sand)", outline: "none" }}
/>
```
- Make submit valid when EITHER name or sourceRef is set: replace `if (!name.trim()) return;` with `const canSubmit = name.trim() !== "" || sourceRef.trim() !== ""; if (!canSubmit) return;`, and change the button's `disabled`/color to use `canSubmit` (compute `const canSubmit = ...` in render).
- Build the body: include `name` only when non-empty, `source_ref` only when non-empty:
```tsx
const body: CustomStopBody = {};
if (name.trim()) body.name = name.trim();
if (sourceRef.trim()) body.source_ref = sourceRef.trim();
if (!isNaN(parsedLat)) body.lat = parsedLat;
if (!isNaN(parsedLon)) body.lon = parsedLon;
onSubmit(body);
```
- Remove `required` from the name input (it's now optional).

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend && npm test -- CustomStopForm && npm run typecheck`
Expected: PASS; clean; no new `act(...)` warnings.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/studio/components/CustomStopForm.tsx frontend/src/studio/components/CustomStopForm.test.tsx
git commit -m "feat(frontend): custom-stop Wikipedia/Wikidata link field"
```

---

### Task 5: Full verification + README

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: tests pass (pre-existing "Body has already been read" stderr noise is not a failure), typecheck clean, build ok. Report the test count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: note `POST /drafts/{id}/stops` accepts an optional `source_ref` (Wikipedia/Wikidata link or QID) that grounds the stop with Wikidata facts + Wikipedia background via `grounding_service` (degrades to a factless stop on failure); mention `wikipedia.fetch_wikidata_qid`. `frontend/README.md`: note the custom-stop form has a "Wikipedia/Wikidata-link of QID" field (name optional when a link is given); a grounded stop shows real facts in the Stop editor. Verify against the code.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: creator grounding via source_ref"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3.1 client → T1; §3.2 grounding_service → T2; §3.3 schema/service/API → T3; §4 frontend → T4; §5 testing → tests in T1–T4; §6 out-of-scope (no auto-question, no P625, degrade-not-break) respected.
- **Placeholder scan:** T1–T3 give full code; T4 cites the file + gives exact edits and a full test; the add_custom_stop test file is located via `grep -rl`.
- **Type consistency:** `source_ref` name identical across `CustomStopRequest` (T3), the frontend type + form body (T4); `build_grounded_poi(ref, *, name=None, location)` (T2) consumed by `add_custom_stop` (T3); the grounded POI id `wikidata:{qid}` and factless `custom:{uuid}` are consistent between service and tests; `fetch_wikidata_qid` signature (T1) matches its `grounding_service` call (T2).
