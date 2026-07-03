from app.cache.store import InMemoryContentStore
from app.models.schemas import POI, GeoPoint, Question, QuestionType, StopContent


def _content(story: str) -> StopContent:
    return StopContent(
        poi=POI(id="p", name="P", location=GeoPoint(lat=52.0, lon=4.0)),
        story=story,
        questions=[Question(type=QuestionType.DATA_BOUND, prompt="?", answer="1")],
        primary_question_index=0,
    )


def test_put_get_by_stop_id_latest_wins():
    store = InMemoryContentStore()
    assert store.get("p::historical") is None
    assert store.put("p::historical", _content("v1")) == 1
    assert store.put("p::historical", _content("v2")) == 2
    got = store.get("p::historical")
    assert got is not None and got.story == "v2"
