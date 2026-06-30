"""Provider-agnostic LLM interface (PRD §8.4).

A thin abstraction lets the provider be swapped on quality/cost/latency without
touching the content pipeline. Generation always happens server-side; the mobile
client never runs the LLM.

The content pipeline calls :meth:`LLMProvider.rephrase`, a template method that
builds the RAG grounding prompt (use only the supplied facts, invent nothing,
omit anything missing — PRD §8.1) and delegates raw text generation to
:meth:`complete`. Providers only implement ``complete``.

Providers:
- ``StubProvider`` — deterministic, offline; echoes the facts. Default; used by
  tests so the suite needs no network or model.
- ``ClaudeCliProvider`` — shells out to the Claude Code CLI in headless mode
  (``claude -p``), which authenticates with the user's **Claude Pro/Max
  subscription** rather than an API key. Note: using a personal subscription for
  automated/commercial backend generation may conflict with Anthropic's usage
  policies — the supported path for production scale is the Claude API. This
  option exists because it was explicitly requested.
- ``OllamaProvider`` — calls a local Ollama server over HTTP.
"""

from __future__ import annotations

import subprocess
from abc import ABC, abstractmethod

import httpx

from app.config import settings
from app.models.schemas import Fact, Theme

_SYSTEM_PROMPT = (
    "You are a local guide writing a short, vivid stop description for a walking "
    "scavenger hunt. You will be given a place name, a theme, a list of verified "
    "facts, and optionally some background to draw on. For any verifiable detail "
    "(dates, numbers, names) use ONLY the verified facts — invent nothing and "
    "leave out anything not given. You may paraphrase the background for colour, "
    "but never copy it verbatim and never treat it as a source of new facts. Keep "
    "it to 2-3 sentences and match the requested theme's tone."
)


def _build_prompt(
    poi_name: str, theme: Theme, facts: list[Fact], background: str | None, tone: str | None = None
) -> str:
    fact_lines = "\n".join(f"- {f.key.replace('_', ' ')}: {f.value}" for f in facts)
    prompt = (
        f"Place: {poi_name}\n"
        f"Theme: {theme.value}\n"
        f"Verified facts (use only these for verifiable claims):\n{fact_lines}\n"
    )
    if background:
        prompt += (
            f"\nBackground to paraphrase (do not copy, do not extract new facts):\n{background}\n"
        )
    if tone:
        prompt += f"\nTone: write in a {tone} tone.\n"
    return prompt + "\nWrite the stop description now."


class LLMProvider(ABC):
    """Abstract base for all LLM providers."""

    def rephrase(
        self,
        *,
        poi_name: str,
        theme: Theme,
        facts: list[Fact],
        background: str | None = None,
        tone: str | None = None,
    ) -> str:
        """Produce a grounded narrative for a stop using ONLY ``facts``.

        ``background`` (e.g. a Wikipedia summary) may be paraphrased for colour
        but is never a source of verifiable facts (PRD §8.1).
        """
        if not facts and not background:
            return f"{poi_name} is part of your trail."
        prompt = _build_prompt(poi_name, theme, facts, background, tone)
        return self.complete(system=_SYSTEM_PROMPT, prompt=prompt).strip()

    @abstractmethod
    def complete(self, *, system: str, prompt: str) -> str:
        """Generate a completion for the given system instruction and prompt."""


class StubProvider(LLMProvider):
    """Deterministic, no-network stand-in used until a real provider is wired up.

    It echoes the supplied facts, keeping the skeleton honest about the grounding
    contract: no facts in, no facts out.
    """

    def rephrase(
        self,
        *,
        poi_name: str,
        theme: Theme,
        facts: list[Fact],
        background: str | None = None,
        tone: str | None = None,
    ) -> str:
        if not facts:
            return f"{poi_name} is part of your trail."
        rendered = "; ".join(f"{f.key.replace('_', ' ')}: {f.value}" for f in facts)
        return f"{poi_name} — {rendered}."

    def complete(self, *, system: str, prompt: str) -> str:  # pragma: no cover
        raise NotImplementedError("StubProvider overrides rephrase directly")


class ClaudeCliProvider(LLMProvider):
    """Generate via the Claude Code CLI headless mode (subscription auth).

    Invokes ``claude -p <prompt> --append-system-prompt <system> --model <model>``.
    The CLI uses the logged-in Claude Pro/Max subscription, so no API key is
    needed. Best suited to batch pre-generation (PRD §9.3), not high-concurrency
    live traffic.
    """

    def complete(self, *, system: str, prompt: str) -> str:
        try:
            result = subprocess.run(
                [
                    settings.claude_cli_path,
                    "-p",
                    prompt,
                    "--append-system-prompt",
                    system,
                    "--model",
                    settings.llm_model,
                ],
                capture_output=True,
                text=True,
                timeout=settings.http_timeout * 4,  # CLI startup + generation
                check=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Claude CLI not found at {settings.claude_cli_path!r}; "
                "install Claude Code and run `claude` once to log in."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Claude CLI failed: {exc.stderr.strip()}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Claude CLI timed out") from exc
        return result.stdout


class OllamaProvider(LLMProvider):
    """Generate via a local Ollama server (``/api/generate``)."""

    def complete(self, *, system: str, prompt: str) -> str:
        try:
            resp = httpx.post(
                f"{settings.ollama_url.rstrip('/')}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "system": system,
                    "prompt": prompt,
                    "stream": False,
                },
                timeout=settings.http_timeout * 4,
            )
            resp.raise_for_status()
            return str(resp.json()["response"])
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise RuntimeError(f"Ollama request failed: {exc}") from exc


_PROVIDERS: dict[str, type[LLMProvider]] = {
    "stub": StubProvider,
    "claude_cli": ClaudeCliProvider,
    "ollama": OllamaProvider,
}


def get_llm_provider() -> LLMProvider:
    """Return the configured provider (defaults to the offline stub)."""
    try:
        return _PROVIDERS[settings.llm_provider]()
    except KeyError as exc:
        raise NotImplementedError(
            f"LLM provider {settings.llm_provider!r} is not implemented; "
            f"choose one of {sorted(_PROVIDERS)}"
        ) from exc
