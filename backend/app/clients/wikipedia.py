"""Wikipedia narrative background (PRD §10).

Wikipedia is CC BY-SA: attribution is required and text must be **paraphrased,
not copied**. We fetch the plain-text summary to hand to the LLM as background
to rephrase (PRD §8.1) — it never sources a verifiable/gating answer. The article
URL is carried through as attribution.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.clients import ClientError

_SUMMARY_API = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
_ACTION_API = "https://{lang}.wikipedia.org/w/api.php"
_HEADERS = {"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"}


@dataclass(frozen=True)
class WikipediaSummary:
    extract: str  # plain-text summary, to be paraphrased
    url: str  # article URL, for attribution


def fetch_wikidata_qid(title: str, lang: str = "en", timeout: float = 30.0) -> str | None:
    """Resolve a Wikipedia article title to its Wikidata QID (pageprops.wikibase_item)."""
    try:
        resp = httpx.get(
            _ACTION_API.format(lang=lang),
            params={
                "action": "query",
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "redirects": "1",
                "titles": title,
                "format": "json",
            },
            timeout=timeout,
            headers=_HEADERS,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Wikipedia QID lookup failed for {title!r}: {exc}") from exc

    for page in data.get("query", {}).get("pages", {}).values():
        qid = page.get("pageprops", {}).get("wikibase_item")
        if qid:
            return str(qid)
    return None


def fetch_summary(title: str, lang: str = "en", timeout: float = 30.0) -> WikipediaSummary | None:
    """Return the article summary for ``title``, or None if there's nothing usable."""
    url = _SUMMARY_API.format(lang=lang, title=title.replace(" ", "_"))
    try:
        resp = httpx.get(url, timeout=timeout, headers=_HEADERS, follow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Wikipedia request failed for {title!r}: {exc}") from exc

    extract = data.get("extract")
    if not extract:
        return None
    page_url = data.get("content_urls", {}).get("desktop", {}).get("page") or (
        f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}"
    )
    return WikipediaSummary(extract=extract, url=page_url)
