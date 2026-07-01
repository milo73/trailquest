"""Content service — the RAG pipeline (PRD §8, §9.1).

Builds a :class:`Stop` per (POI × theme): a grounded narrative plus a question
whose *type* determines whether it may gate. Type-A/D questions are generated
**from** a known fact, so the system always holds the verified answer — it never
asks the LLM to judge something it cannot verify.

Results are cached per (POI × theme) so each generation happens once (PRD §9.3).
"""

from __future__ import annotations

from app.cache.store import content_cache
from app.config import settings
from app.models.schemas import (
    POI,
    Question,
    QuestionType,
    Source,
    Stop,
    Theme,
)
from app.services.llm import get_llm_provider
from app.services.llm.provider import StubProvider

# Fact keys we know how to turn into a data-bound (Type-A) question, with phrasing.
_DATA_BOUND_TEMPLATES: dict[str, str] = {
    "height_m": "Hoe hoog is {name}, in meters?",
    "build_year": "In welk jaar is {name} gebouwd?",
    "build_year_start": "In welk jaar begon de bouw van {name}?",
    "founded_year": "In welk jaar is {name} opgericht?",
    "architect": "Wie was de architect van {name}?",
}

_HINT_LABELS: dict[str, str] = {
    "height_m": "hoogte",
    "build_year": "bouwjaar",
    "build_year_start": "bouwjaar",
    "founded_year": "oprichtingsjaar",
    "architect": "architect",
}


def _build_question(poi: POI) -> Question:
    """Generate a question for a POI.

    Prefers a Type-A question built from a verifiable fact (so the answer is
    known and the question may gate). Falls back to a Type-C reflection question
    when no fact is usable — which always lets the player through.
    """
    for fact in poi.facts:
        template = _DATA_BOUND_TEMPLATES.get(fact.key)
        if template:
            return Question(
                type=QuestionType.DATA_BOUND,
                prompt=template.format(name=poi.name),
                answer=fact.value,
                hint=(
                    f"Tip: het gaat over de "
                    f"{_HINT_LABELS.get(fact.key, fact.key.replace('_', ' '))}."
                ),
            )
    # No data-bound fact available → open reflection (never gates on correctness).
    return Question(
        type=QuestionType.OPEN_REFLECTION,
        prompt=f"Kijk eens rond bij {poi.name}. Wat denk je dat hier vroeger is gebeurd?",
    )


def build_stop(poi: POI, theme: Theme, order: int) -> Stop:
    """Build (or fetch from the persistent store) the content for one stop.

    A cache hit means this (POI × theme) was generated before — by this or any
    prior process/user — so we never pay for the same generation twice (PRD §9.3).
    """
    cached = content_cache.get(poi.id, theme)
    if cached is not None:
        return cached.model_copy(update={"order": order})

    question = _build_question(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
    except RuntimeError:
        # The LLM provider failed (offline, timeout, CLI missing). Degrade rather
        # than break (PRD §13): serve a deterministic, still-grounded story from
        # the stub. Do NOT cache it — a one-off failure must not poison the
        # (POI × theme) entry; a later run can regenerate with the real provider.
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
        return Stop(order=order, poi=poi, story=story, question=question)

    stop = Stop(order=order, poi=poi, story=story, question=question)
    content_cache.put(poi.id, theme, stop, source=f"{settings.llm_provider}:{settings.llm_model}")
    return stop


def author_content(poi: POI, theme: Theme, tone: str | None = None) -> tuple[str, Question]:
    """Generate authoring content (story + candidate question) for one POI.

    Unlike :func:`build_stop` this never reads or writes the (POI × theme) cache —
    the studio author wants fresh output scoped to the facts they selected (the
    caller passes a POI carrying only those facts). Degrades to the stub on any
    provider failure (PRD §13).
    """
    question = _build_question(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    return story, question


def collect_attributions(sources: list[Source]) -> list[str]:
    """Deduplicated source attributions to carry through to display (PRD §10)."""
    seen: dict[str, str] = {}
    for source in sources:
        seen[source.name] = f"{source.name} ({source.license.value})"
    return sorted(seen.values())
