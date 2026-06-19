"""Provider-agnostic LLM abstraction (PRD §8.4)."""

from app.services.llm.provider import LLMProvider, get_llm_provider

__all__ = ["LLMProvider", "get_llm_provider"]
