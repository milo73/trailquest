import pytest

from app.models.schemas import POI, DraftStop, GeoPoint, Question, QuestionType, Stop


def _poi() -> POI:
    return POI(id="p1", name="Toren", location=GeoPoint(lat=52.0, lon=4.0))


def _a() -> Question:
    return Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")


def _c() -> Question:
    return Question(type=QuestionType.OPEN_REFLECTION, prompt="Kijk rond?")


def test_stop_holds_questions_and_primary():
    stop = Stop(order=1, poi=_poi(), story="s", questions=[_a(), _c()], primary_question_index=0)
    assert len(stop.questions) == 2
    assert stop.primary_question is stop.questions[0]


def test_stop_primary_index_out_of_range_raises():
    with pytest.raises(ValueError):
        Stop(order=1, poi=_poi(), story="s", questions=[_a()], primary_question_index=3)


def test_stop_reflection_primary_is_allowed():
    # a reflection primary is playable (gates-through), not a crash
    stop = Stop(order=1, poi=_poi(), story="s", questions=[_c()], primary_question_index=0)
    assert stop.primary_question.type is QuestionType.OPEN_REFLECTION


def test_stop_lifts_legacy_singular_question():
    legacy = {"order": 1, "poi": _poi().model_dump(), "story": "s", "question": _a().model_dump()}
    stop = Stop.model_validate(legacy)
    assert stop.questions[0].answer == "78"
    assert stop.primary_question_index == 0


def test_draftstop_defaults_and_legacy_lift():
    empty = DraftStop(order=1, poi=_poi())
    assert empty.questions == [] and empty.primary_question_index is None
    legacy = {"order": 2, "poi": _poi().model_dump(), "question": _a().model_dump()}
    lifted = DraftStop.model_validate(legacy)
    assert lifted.questions[0].answer == "78" and lifted.primary_question_index == 0
