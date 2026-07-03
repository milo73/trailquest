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
    StopContent,
    Theme,
    stop_id_for,
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


def _build_questions(poi: POI) -> tuple[list[Question], int]:
    """Generate a stop's questions: one Type-A per data-bound fact (the primary
    gates), plus a trailing Type-C reflection bonus. The list is never empty; the
    primary is index 0 — the first data-bound question when any exist, else the
    reflection (playable, gates-through)."""
    questions: list[Question] = []
    for fact in poi.facts:
        template = _DATA_BOUND_TEMPLATES.get(fact.key)
        if template:
            questions.append(
                Question(
                    type=QuestionType.DATA_BOUND,
                    prompt=template.format(name=poi.name),
                    answer=fact.value,
                    hint=(
                        f"Tip: het gaat over de "
                        f"{_HINT_LABELS.get(fact.key, fact.key.replace('_', ' '))}."
                    ),
                )
            )
    questions.append(
        Question(
            type=QuestionType.OPEN_REFLECTION,
            prompt=f"Kijk eens rond bij {poi.name}. Wat denk je dat hier vroeger is gebeurd?",
        )
    )
    return questions, 0


def _is_complete(c: StopContent) -> bool:
    return (
        bool(c.story and c.story.strip())
        and len(c.questions) >= 1
        and c.primary_question_index is not None
    )


def build_stop(poi: POI, theme: Theme, order: int) -> Stop:
    """Build (or fetch from the persistent store) the content for one stop.

    A cache hit means this (POI × theme) was generated before — by this or any
    prior process/user — so we never pay for the same generation twice (PRD §9.3).
    """
    sid = stop_id_for(poi.id, theme)
    cached = content_cache.get(sid)
    if cached is not None and _is_complete(cached):
        assert cached.story is not None
        return Stop(
            id=sid,
            order=order,
            poi=cached.poi,
            story=cached.story,
            questions=cached.questions,
            primary_question_index=cached.primary_question_index or 0,
        )

    questions, primary_index = _build_questions(poi)
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
        return Stop(
            id=sid,
            order=order,
            poi=poi,
            story=story,
            questions=questions,
            primary_question_index=primary_index,
        )

    content = StopContent(
        poi=poi, story=story, questions=questions, primary_question_index=primary_index
    )
    content_cache.put(sid, content, source=f"{settings.llm_provider}:{settings.llm_model}")
    return Stop(
        id=sid,
        order=order,
        poi=poi,
        story=story,
        questions=questions,
        primary_question_index=primary_index,
    )


def author_content(
    poi: POI, theme: Theme, tone: str | None = None
) -> tuple[str, list[Question], int]:
    """Generate authoring content (story + candidate questions) for one POI.

    Unlike :func:`build_stop` this never reads or writes the (POI × theme) cache —
    the studio author wants fresh output scoped to the facts they selected (the
    caller passes a POI carrying only those facts). Degrades to the stub on any
    provider failure (PRD §13).
    """
    questions, primary_index = _build_questions(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    return story, questions, primary_index


def collect_attributions(sources: list[Source]) -> list[str]:
    """Deduplicated source attributions to carry through to display (PRD §10)."""
    seen: dict[str, str] = {}
    for source in sources:
        seen[source.name] = f"{source.name} ({source.license.value})"
    return sorted(seen.values())
