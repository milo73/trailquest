"""Turn a creator-supplied reference (Wikipedia/Wikidata link or QID) into a
grounded POI — Wikidata facts (CC0) + Wikipedia background (CC BY-SA), reusing the
same retrieval pipeline as the live POI source. Degrades to a factless POI on any
failure (PRD §13)."""

from __future__ import annotations

import re
import uuid
from urllib.parse import unquote

from app.clients import ClientError, wikidata, wikipedia
from app.config import settings
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense

_WIKIPEDIA_URL = re.compile(r"https?://(\w+)\.wikipedia\.org/wiki/([^?#]+)", re.IGNORECASE)
_QID = re.compile(r"Q\d+", re.IGNORECASE)


def resolve_reference(ref: str) -> str | None:
    """Resolve a reference to a Wikidata QID, or None. Never raises."""
    ref = ref.strip()
    if not ref:
        return None
    match = _WIKIPEDIA_URL.match(ref)
    if match:
        lang, raw_title = match.group(1), match.group(2)
        title = unquote(raw_title).replace("_", " ")
        try:
            return wikipedia.fetch_wikidata_qid(title, lang)
        except ClientError:
            return None
    qid = _QID.search(ref)  # bare QID or a wikidata.org URL containing one
    return qid.group(0).upper() if qid else None


def _factless(name: str | None, location: GeoPoint) -> POI:
    return POI(id=f"custom:{uuid.uuid4()}", name=name or "Nieuwe stop", location=location, facts=[])


def build_grounded_poi(ref: str, *, name: str | None = None, location: GeoPoint) -> POI:
    qid = resolve_reference(ref)
    if qid is None:
        return _factless(name, location)
    try:
        entity = wikidata.fetch_entity(qid)
    except ClientError:
        return _factless(name, location)

    source = Source(name="Wikidata", license=SourceLicense.CC0, reference=f"wikidata:{qid}")
    facts = [Fact(key=k, value=v, source=source) for k, v in entity.facts.items()]

    background: str | None = None
    background_source: Source | None = None
    if entity.enwiki_title:
        try:
            summary = wikipedia.fetch_summary(entity.enwiki_title, timeout=settings.http_timeout)
        except ClientError:
            summary = None
        if summary is not None:
            background = summary.extract
            background_source = Source(
                name="Wikipedia", license=SourceLicense.CC_BY_SA, reference=summary.url
            )

    return POI(
        id=f"wikidata:{qid}",
        name=name or entity.enwiki_title or "Nieuwe stop",
        location=location,
        facts=facts,
        background=background,
        background_source=background_source,
    )
