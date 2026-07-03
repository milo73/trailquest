from app.models.schemas import POI, GeoPoint, Question, QuestionType, Stop
from app.services import answer_service


def _stop() -> Stop:
    primary = Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")
    bonus = Question(type=QuestionType.DATA_BOUND, prompt="Bouwjaar?", answer="1520")
    return Stop(
        order=1,
        poi=POI(id="p", name="Toren", location=GeoPoint(lat=52.0, lon=4.0)),
        story="s",
        questions=[primary, bonus],
        primary_question_index=0,
    )


def test_primary_correct_unlocks():
    r = answer_service.evaluate_in_stop(_stop(), 0, "78", 1)
    assert r.correct and r.unlocked_next


def test_bonus_correct_does_not_unlock():
    r = answer_service.evaluate_in_stop(_stop(), 1, "1520", 1)
    assert r.correct and r.unlocked_next is False


def test_none_index_targets_primary():
    r = answer_service.evaluate_in_stop(_stop(), None, "78", 1)
    assert r.unlocked_next


def test_primary_feedback_is_dutch():
    r = answer_service.evaluate_in_stop(_stop(), 0, "78", 1)
    assert "volgende stop" in r.feedback.lower()
