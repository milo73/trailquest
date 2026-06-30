import pytest

from app.cache.store import drafts
from app.models.schemas import DraftCreate, GeoPoint, Question, QuestionType
from app.services import draft_service, poi_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def _draft_with_one_stop():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    poi_id = poi_service.candidates(HAARLEM, 5)[0].id
    draft_service.update(
        d.id,
        __import__("app.models.schemas", fromlist=["DraftUpdate"]).DraftUpdate(
            stop_poi_ids=[poi_id]
        ),
    )
    return draft_service.get(d.id)


def test_set_stop_content_persists_story_and_question():
    d = _draft_with_one_stop()
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="Wat denk je?")
    updated = draft_service.set_stop_content(d.id, 1, story="Een mooi verhaal.", question=q)
    assert updated.stops[0].story == "Een mooi verhaal."
    assert updated.stops[0].question.prompt == "Wat denk je?"
    # persisted
    assert draft_service.get(d.id).stops[0].story == "Een mooi verhaal."


def test_set_stop_content_unknown_draft_or_stop_returns_none():
    assert draft_service.set_stop_content("nope", 1, story="x") is None
    d = _draft_with_one_stop()
    assert draft_service.set_stop_content(d.id, 99, story="x") is None


def test_generate_stop_content_filters_by_fact_keys():
    d = _draft_with_one_stop()
    stop_poi = draft_service.get(d.id).stops[0].poi
    # generate with an empty fact selection → story must not contain any fact value
    story, question = draft_service.generate_stop_content(d.id, 1, fact_keys=[])
    for fact in stop_poi.facts:
        assert fact.value not in story
    # generate with all facts → at least one fact value appears (stub echoes facts)
    story_all, _ = draft_service.generate_stop_content(d.id, 1, fact_keys=None)
    assert any(f.value in story_all for f in stop_poi.facts)


def test_generate_unknown_returns_none():
    assert draft_service.generate_stop_content("nope", 1) is None
