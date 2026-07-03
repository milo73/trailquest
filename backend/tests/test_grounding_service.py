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
