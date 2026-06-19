"""Wikidata structured-fact retrieval (PRD §10).

Wikidata is CC0 and is the intended ground truth for Type-A questions (PRD §8.2):
its values are verifiable and carry a stable source reference. This client pulls:

- literal facts — inception year (P571) and height (P2048);
- reference-valued facts — architect (P84) and heritage status (P1435), whose
  values are entity ids that need a second label lookup;
- the English Wikipedia article title (sitelink), used for narrative enrichment.

Missing properties are simply absent — we never invent a value (PRD §8.1).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from app.clients import ClientError
from app.config import settings

_INCEPTION = "P571"  # time value, e.g. "+1370-00-00T00:00:00Z"
_HEIGHT = "P2048"  # quantity value with an "amount" like "+78"
_ARCHITECT = "P84"  # entity reference → label
_HERITAGE = "P1435"  # entity reference → label

# Reference-valued properties → our normalized fact key.
_REFERENCE_PROPS = {_ARCHITECT: "architect", _HERITAGE: "heritage_status"}

_HEADERS = {"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"}


@dataclass(frozen=True)
class EntityData:
    facts: dict[str, str] = field(default_factory=dict)
    enwiki_title: str | None = None


def _extract_year(time_value: str) -> str | None:
    sign = -1 if time_value.startswith("-") else 1
    digits = time_value.lstrip("+-").split("-", 1)[0]
    return str(sign * int(digits)) if digits.isdigit() else None


def _get(params: dict[str, str]) -> dict:
    try:
        resp = httpx.get(
            settings.wikidata_api_url,
            params={"format": "json", **params},
            timeout=settings.http_timeout,
            headers=_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Wikidata request failed: {exc}") from exc


def _resolve_labels(qids: list[str]) -> dict[str, str]:
    if not qids:
        return {}
    data = _get(
        {"action": "wbgetentities", "ids": "|".join(qids), "props": "labels", "languages": "en"}
    )
    out: dict[str, str] = {}
    for qid, ent in data.get("entities", {}).items():
        label = ent.get("labels", {}).get("en", {}).get("value")
        if label:
            out[qid] = label
    return out


def fetch_entity(wikidata_id: str) -> EntityData:
    """Fetch normalized facts + the English Wikipedia title for an entity."""
    data = _get(
        {
            "action": "wbgetentities",
            "ids": wikidata_id,
            "props": "claims|sitelinks",
            "languages": "en",
        }
    )
    try:
        entity = data["entities"][wikidata_id]
    except KeyError as exc:
        raise ClientError(f"Wikidata returned no entity for {wikidata_id}") from exc

    claims = entity.get("claims", {})
    facts: dict[str, str] = {}

    inception = _first_value(claims, _INCEPTION)
    if isinstance(inception, dict) and (year := _extract_year(inception.get("time", ""))):
        facts["build_year"] = year

    height = _first_value(claims, _HEIGHT)
    if isinstance(height, dict) and "amount" in height:
        facts["height_m"] = height["amount"].lstrip("+")

    # Reference-valued props: collect the referenced QIDs, resolve labels in one call.
    referenced: dict[str, str] = {}  # our key -> referenced QID
    for prop, key in _REFERENCE_PROPS.items():
        value = _first_value(claims, prop)
        if isinstance(value, dict) and (qid := value.get("id")):
            referenced[key] = qid
    labels = _resolve_labels(list(referenced.values()))
    for key, qid in referenced.items():
        if qid in labels:
            facts[key] = labels[qid]

    title = entity.get("sitelinks", {}).get("enwiki", {}).get("title")
    return EntityData(facts=facts, enwiki_title=title)


def fetch_facts(wikidata_id: str) -> dict[str, str]:
    """Backward-compatible helper returning only the normalized facts."""
    return fetch_entity(wikidata_id).facts


def _first_value(claims: dict, prop: str) -> object | None:
    """The datavalue of a property's first claim, or None if absent/novalue."""
    statements = claims.get(prop)
    if not statements:
        return None
    snak = statements[0].get("mainsnak", {})
    if snak.get("snaktype") != "value":
        return None
    return snak.get("datavalue", {}).get("value")
