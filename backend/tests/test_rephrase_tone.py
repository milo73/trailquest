from app.models.schemas import Fact, Source, SourceLicense, Theme
from app.services.llm.provider import StubProvider


def _fact() -> Fact:
    return Fact(
        key="height_m",
        value="78",
        source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"),
    )


def test_stub_rephrase_accepts_tone_and_stays_grounded():
    # tone is accepted (no TypeError) and the stub still echoes only the facts
    story = StubProvider().rephrase(
        poi_name="Toren", theme=Theme.HISTORICAL, facts=[_fact()], tone="speels"
    )
    assert "78" in story
    assert "Toren" in story
