"""Wikidata structured-fact retrieval (PRD §10).

Wikidata is CC0 and is the intended ground truth for Type-A questions (PRD §8.2):
its values are verifiable and carry a stable source reference. This client pulls
the small set of literal facts we can turn into data-bound questions today —
inception year and height — plus the English label. Reference-valued properties
(architect, heritage status) need a second label lookup and are left for later.
"""

from __future__ import annotations

import httpx

from app.clients import ClientError
from app.config import settings

# Wikidata property IDs → our normalized fact keys.
_INCEPTION = "P571"  # time value, e.g. "+1370-00-00T00:00:00Z"
_HEIGHT = "P2048"  # quantity value with an "amount" like "+78"


def _extract_year(time_value: str) -> str | None:
    # Time strings look like "+1370-00-00T00:00:00Z"; the year is the leading int.
    sign = -1 if time_value.startswith("-") else 1
    digits = time_value.lstrip("+-").split("-", 1)[0]
    return str(sign * int(digits)) if digits.isdigit() else None


def fetch_facts(wikidata_id: str) -> dict[str, str]:
    """Return normalized literal facts for a Wikidata entity.

    Keys may include ``build_year`` and ``height_m``. Missing properties are
    simply absent — we never invent a value (PRD §8.1).
    """
    try:
        resp = httpx.get(
            settings.wikidata_api_url,
            params={
                "action": "wbgetentities",
                "ids": wikidata_id,
                "format": "json",
                "props": "claims",
                "languages": "en",
            },
            timeout=settings.http_timeout,
            headers={"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"},
        )
        resp.raise_for_status()
        entity = resp.json()["entities"][wikidata_id]
        claims = entity.get("claims", {})
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise ClientError(f"Wikidata request failed for {wikidata_id}: {exc}") from exc

    facts: dict[str, str] = {}

    inception = _first_value(claims, _INCEPTION)
    if isinstance(inception, dict) and (year := _extract_year(inception.get("time", ""))):
        facts["build_year"] = year

    height = _first_value(claims, _HEIGHT)
    if isinstance(height, dict) and "amount" in height:
        facts["height_m"] = height["amount"].lstrip("+")

    return facts


def _first_value(claims: dict, prop: str) -> object | None:
    """The datavalue of a property's first claim, or None if absent/novalue."""
    statements = claims.get(prop)
    if not statements:
        return None
    snak = statements[0].get("mainsnak", {})
    if snak.get("snaktype") != "value":
        return None
    return snak.get("datavalue", {}).get("value")
