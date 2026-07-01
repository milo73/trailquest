"""Tests for the provider-agnostic LLM layer (selection + grounding contract)."""

from __future__ import annotations

import pytest

from app.config import settings
from app.models.schemas import Fact, Source, SourceLicense, Theme
from app.services.llm import get_llm_provider
from app.services.llm.provider import (
    ClaudeCliProvider,
    LLMProvider,
    OllamaProvider,
    StubProvider,
)


def _fact(key: str, value: str) -> Fact:
    return Fact(
        key=key,
        value=value,
        source=Source(name="Wikidata", license=SourceLicense.CC0, reference="wikidata:Q1"),
    )


def test_default_provider_is_stub() -> None:
    assert isinstance(get_llm_provider(), StubProvider)


@pytest.mark.parametrize(
    ("name", "cls"),
    [("stub", StubProvider), ("claude_cli", ClaudeCliProvider), ("ollama", OllamaProvider)],
)
def test_provider_selection(
    monkeypatch: pytest.MonkeyPatch, name: str, cls: type[LLMProvider]
) -> None:
    monkeypatch.setattr(settings, "llm_provider", name)
    assert isinstance(get_llm_provider(), cls)


def test_unknown_provider_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "gpt")
    with pytest.raises(NotImplementedError):
        get_llm_provider()


def test_stub_is_grounded_in_facts() -> None:
    story = StubProvider().rephrase(
        poi_name="Tower", theme=Theme.HISTORICAL, facts=[_fact("height_m", "78")]
    )
    assert "78" in story and "Tower" in story


def test_factless_poi_gets_non_factual_line() -> None:
    story = StubProvider().rephrase(poi_name="Square", theme=Theme.MIXED, facts=[])
    assert story == "Square is onderdeel van je speurtocht."


def test_real_provider_rephrase_builds_grounded_prompt() -> None:
    """The base rephrase() must pass only the supplied facts to complete()."""
    captured: dict[str, str] = {}

    class _Recorder(LLMProvider):
        def complete(self, *, system: str, prompt: str) -> str:
            captured["system"] = system
            captured["prompt"] = prompt
            return "generated"

    out = _Recorder().rephrase(
        poi_name="Tower", theme=Theme.ARCHITECTURE, facts=[_fact("height_m", "78")]
    )
    assert out == "generated"
    assert "verzin" in captured["system"].lower()
    assert "78" in captured["prompt"] and "architecture" in captured["prompt"]
