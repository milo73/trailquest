"""Content service — the RAG pipeline (PRD §8, §9.1).

Builds a :class:`Stop` per (POI × theme): a grounded narrative plus a question
whose *type* determines whether it may gate. Type-A/D questions are generated
**from** a known fact, so the system always holds the verified answer — it never
asks the LLM to judge something it cannot verify.

Results are cached per (POI × theme) so each generation happens once (PRD §9.3).
"""

from __future__ import annotations

from app.cache.store import content_cache
from app.models.schemas import (
    POI,
    Fact,
    Question,
    QuestionType,
    Stop,
    Theme,
)
from app.services.llm import get_llm_provider

# Fact keys we know how to turn into a data-bound (Type-A) question, with phrasing.
_DATA_BOUND_TEMPLATES: dict[str, str] = {
    "height_m": "How tall is {name}, in metres?",
    "build_year": "In which year was {name} built?",
    "build_year_start": "In which year did construction of {name} begin?",
    "founded_year": "In which year was {name} founded?",
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
                hint=f"It relates to {fact.key.replace('_', ' ')}.",
            )
    # No data-bound fact available → open reflection (never gates on correctness).
    return Question(
        type=QuestionType.OPEN_REFLECTION,
        prompt=f"Take a look around {poi.name}. What do you think happened here in the past?",
    )


def build_stop(poi: POI, theme: Theme, order: int) -> Stop:
    """Build (or fetch from cache) the content for one stop."""
    cached = content_cache.get(poi.id, theme)
    if cached is not None:
        return cached.model_copy(update={"order": order})

    story = get_llm_provider().rephrase(poi_name=poi.name, theme=theme, facts=poi.facts)
    stop = Stop(order=order, poi=poi, story=story, question=_build_question(poi))
    content_cache.put(poi.id, theme, stop)
    return stop


def collect_attributions(facts: list[Fact]) -> list[str]:
    """Deduplicated source attributions to carry through to display (PRD §10)."""
    seen: dict[str, str] = {}
    for fact in facts:
        seen[fact.source.name] = f"{fact.source.name} ({fact.source.license.value})"
    return sorted(seen.values())
