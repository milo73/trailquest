"""Provider-agnostic LLM interface.

Keeping a thin abstraction here lets the provider (Claude, GPT, Gemini) be
swapped on quality/cost/latency without touching the content pipeline (PRD §8.4).
Generation always happens server-side; the mobile client never runs the LLM.

The content pipeline calls :meth:`LLMProvider.rephrase`, which is contractually
limited to *rephrasing supplied ground-truth facts* — it must invent nothing and
omit anything not present in ``facts`` (the RAG grounding rule, PRD §8.1).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.config import settings
from app.models.schemas import Fact, Theme


class LLMProvider(ABC):
    """Abstract base for all LLM providers."""

    @abstractmethod
    def rephrase(self, *, poi_name: str, theme: Theme, facts: list[Fact]) -> str:
        """Produce a grounded narrative for a stop using ONLY ``facts``.

        Implementations must instruct the model to use only the supplied facts,
        invent nothing, and omit anything missing.
        """


class StubProvider(LLMProvider):
    """Deterministic, no-network stand-in used until a real provider is wired up.

    It only ever echoes the supplied facts, which keeps the skeleton honest about
    the grounding contract: no facts in, no facts out.
    """

    def rephrase(self, *, poi_name: str, theme: Theme, facts: list[Fact]) -> str:
        if not facts:
            return f"{poi_name} is part of your trail."
        rendered = "; ".join(f"{f.key.replace('_', ' ')}: {f.value}" for f in facts)
        return f"{poi_name} — {rendered}."


def get_llm_provider() -> LLMProvider:
    """Return the configured provider. Defaults to the stub (no API key needed)."""
    if settings.llm_provider == "stub":
        return StubProvider()
    # TODO: add ClaudeProvider (default for production AI features) and others.
    raise NotImplementedError(f"LLM provider {settings.llm_provider!r} is not implemented yet")
