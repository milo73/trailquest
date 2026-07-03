"""Tests for the external-source clients, with HTTP mocked (no network)."""

from __future__ import annotations

import httpx
import pytest

from app.clients import ClientError, osrm, overpass, wikidata, wikipedia


class _FakeResponse:
    def __init__(self, payload: object, status: int = 200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)  # type: ignore[arg-type]

    def json(self) -> object:
        return self._payload


def test_overpass_parses_nodes_and_centers(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": 52.38,
                "lon": 4.63,
                "tags": {"name": "A", "wikidata": "Q1"},
            },
            {
                "type": "way",
                "id": 2,
                "center": {"lat": 52.39, "lon": 4.64},
                "tags": {"name": "B", "wikidata": "Q2"},
            },
            {"type": "node", "id": 3, "lat": 52.4, "lon": 4.65, "tags": {"name": "NoWikidata"}},
        ]
    }
    monkeypatch.setattr(overpass.httpx, "post", lambda *a, **k: _FakeResponse(payload))
    pois = overpass.fetch_pois(52.38, 4.63, 600)
    assert [p.wikidata_id for p in pois] == ["Q1", "Q2"]  # the un-tagged node is dropped
    assert pois[1].lat == 52.39  # center used for the way


def test_overpass_raises_client_error_on_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(overpass.httpx, "post", lambda *a, **k: _FakeResponse({}, status=429))
    with pytest.raises(ClientError):
        overpass.fetch_pois(52.38, 4.63, 600)


def test_wikidata_extracts_year_and_height(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "entities": {
            "Q1542249": {
                "claims": {
                    "P571": [
                        {
                            "mainsnak": {
                                "snaktype": "value",
                                "datavalue": {"value": {"time": "+1370-00-00T00:00:00Z"}},
                            }
                        }
                    ],
                    "P2048": [
                        {
                            "mainsnak": {
                                "snaktype": "value",
                                "datavalue": {"value": {"amount": "+78"}},
                            }
                        }
                    ],
                }
            }
        }
    }
    monkeypatch.setattr(wikidata.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    facts = wikidata.fetch_facts("Q1542249")
    assert facts == {"build_year": "1370", "height_m": "78"}


def test_wikidata_omits_missing_properties(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entities": {"Q2": {"claims": {}}}}
    monkeypatch.setattr(wikidata.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    assert wikidata.fetch_facts("Q2") == {}


def test_wikidata_resolves_reference_facts_and_enwiki_title(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entity = {
        "entities": {
            "Q1": {
                "claims": {
                    "P84": [
                        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q42"}}}}
                    ],
                },
                "sitelinks": {"enwiki": {"title": "Grote Kerk (Haarlem)"}},
            }
        }
    }
    labels = {"entities": {"Q42": {"labels": {"en": {"value": "Lieven de Key"}}}}}

    def fake_get(url, params, **kwargs):  # type: ignore[no-untyped-def]
        # First call requests claims|sitelinks; the label-resolution call asks for labels.
        return _FakeResponse(labels if params.get("props") == "labels" else entity)

    monkeypatch.setattr(wikidata.httpx, "get", fake_get)
    data = wikidata.fetch_entity("Q1")
    assert data.facts == {"architect": "Lieven de Key"}
    assert data.enwiki_title == "Grote Kerk (Haarlem)"


def test_wikipedia_summary_returns_extract_and_url(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "extract": "The Grote Kerk is a church in Haarlem.",
        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Grote_Kerk"}},
    }
    monkeypatch.setattr(wikipedia.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    summary = wikipedia.fetch_summary("Grote Kerk (Haarlem)")
    assert summary is not None
    assert "church in Haarlem" in summary.extract
    assert summary.url.endswith("Grote_Kerk")


def test_wikipedia_summary_none_when_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wikipedia.httpx, "get", lambda *a, **k: _FakeResponse({"extract": ""}))
    assert wikipedia.fetch_summary("Nothing") is None


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


def test_osrm_orders_loop_and_reports_distance(monkeypatch: pytest.MonkeyPatch) -> None:
    # start=0, then two stops; OSRM says visit input index 2 before index 1.
    payload = {
        "code": "Ok",
        "trips": [{"distance": 2500.0}],
        "waypoints": [
            {"waypoint_index": 0},  # input 0 (start)
            {"waypoint_index": 2},  # input 1 visited last
            {"waypoint_index": 1},  # input 2 visited first
        ],
    }
    monkeypatch.setattr(osrm.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    trip = osrm.optimized_loop([(52.0, 4.0), (52.1, 4.1), (52.2, 4.2)])
    assert trip.order == [0, 2, 1]
    assert trip.distance_km == 2.5


def test_osrm_raises_on_non_ok_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osrm.httpx, "get", lambda *a, **k: _FakeResponse({"code": "NoRoute"}))
    with pytest.raises(ClientError):
        osrm.optimized_loop([(52.0, 4.0), (52.1, 4.1)])
