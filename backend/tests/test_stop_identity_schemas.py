from app.models.schemas import (
    POI,
    DraftStop,
    GeoPoint,
    Question,
    QuestionType,
    Stop,
    StopContent,
    StopRef,
    Theme,
    stop_id_for,
)


def _poi() -> POI:
    return POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))


def _q() -> Question:
    return Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")


def test_stop_id_for_encodes_poi_and_theme():
    assert stop_id_for("grote-markt", Theme.HISTORICAL) == "grote-markt::historical"


def test_stop_and_draftstop_have_id_defaulting_empty():
    s = Stop(order=1, poi=_poi(), story="s", questions=[_q()], primary_question_index=0)
    assert s.id == ""
    d = DraftStop(order=1, poi=_poi())
    assert d.id == ""


def test_stopcontent_is_order_free_and_optional():
    c = StopContent(poi=_poi())
    assert c.story is None and c.questions == [] and c.primary_question_index is None
    c2 = StopContent(poi=_poi(), story="s", questions=[_q()], primary_question_index=0)
    assert c2.story == "s"


def test_stopref_shape():
    r = StopRef(stop_id="grote-markt::historical", order=2)
    assert r.stop_id == "grote-markt::historical" and r.order == 2
