"""POI / data service (PRD §9.1).

Fetches and normalizes POIs and their facts from OSM / Wikidata / Wikipedia.
Two sources are supported (config ``poi_source``):

- ``"seed"`` (default): a small bundled Haarlem set with real, source-attributed
  facts. Offline and deterministic — used by tests and as a fallback.
- ``"live"``: query Overpass (OSM) for Wikidata-linked POIs in range, then pull
  structured facts from Wikidata. Falls back to the seed set if Overpass fails,
  so a flaky upstream degrades rather than breaks (PRD §13).

A real deployment would cache both the POI list and the per-POI facts (PRD §9.1).
"""

from __future__ import annotations

import logging

from app.clients import ClientError, overpass, wikidata, wikipedia
from app.config import settings
from app.models.schemas import (
    POI,
    Fact,
    GeoPoint,
    Source,
    SourceLicense,
)

logger = logging.getLogger(__name__)


def _wikidata(qid: str) -> Source:
    """Wikidata source reference (CC0 — the ground truth for Type-A facts)."""
    return Source(name="Wikidata", license=SourceLicense.CC0, reference=f"wikidata:{qid}")


# Seed POIs for Haarlem. Facts carry their source (PRD §8.1, §10) and every
# value/QID below is verified against Wikidata — no invented facts or references.
_HAARLEM_POIS: list[POI] = [
    POI(
        id="grote-kerk-haarlem",
        name="Grote Kerk (Grote of Sint-Bavokerk)",
        location=GeoPoint(lat=52.3814, lon=4.6366),
        facts=[
            Fact(key="build_year", value="1400", source=_wikidata("Q1545193")),
            Fact(key="heritage_status", value="Rijksmonument", source=_wikidata("Q1545193")),
        ],
    ),
    POI(
        id="de-adriaan-windmill",
        name="Molen De Adriaan",
        location=GeoPoint(lat=52.3849, lon=4.6406),
        facts=[
            Fact(key="build_year", value="1779", source=_wikidata("Q2763574")),
        ],
    ),
    POI(
        id="frans-hals-museum",
        name="Frans Hals Museum",
        location=GeoPoint(lat=52.3759, lon=4.6320),
        facts=[
            Fact(key="build_year", value="1862", source=_wikidata("Q574961")),
            Fact(key="architect", value="Lucas Christiaan Dumont", source=_wikidata("Q574961")),
        ],
    ),
    POI(
        id="teylers-museum",
        name="Teylers Museum",
        location=GeoPoint(lat=52.3796, lon=4.6411),
        facts=[
            Fact(key="build_year", value="1784", source=_wikidata("Q474563")),
            Fact(key="heritage_status", value="Rijksmonument", source=_wikidata("Q474563")),
        ],
    ),
    # A deliberately fact-less POI to exercise the "skip / non-factual" path.
    POI(
        id="grote-markt-square",
        name="Grote Markt",
        location=GeoPoint(lat=52.3816, lon=4.6376),
        facts=[],
    ),
]


def _search_radius_m(distance_km: float) -> int:
    """Radius to gather candidates in, derived from the target loop distance.

    Roughly a quarter of the loop length keeps stops within a walkable cluster;
    bounded so very short/long requests still return a sane area.
    """
    return int(min(max(distance_km * 250, 400), 5000))


def _wikipedia_background(title: str | None) -> tuple[str | None, Source | None]:
    """Fetch a paraphrasable Wikipedia summary + its attribution, if enabled."""
    if not (title and settings.enrich_wikipedia):
        return None, None
    try:
        summary = wikipedia.fetch_summary(title, timeout=settings.http_timeout)
    except ClientError:
        return None, None
    if summary is None:
        return None, None
    source = Source(name="Wikipedia", license=SourceLicense.CC_BY_SA, reference=summary.url)
    return summary.extract, source


def _fetch_live(near: GeoPoint, distance_km: float) -> list[POI]:
    """Query Overpass for candidates, then enrich each with Wikidata + Wikipedia."""
    raw = overpass.fetch_pois(near.lat, near.lon, _search_radius_m(distance_km))
    pois: list[POI] = []
    for el in raw:
        try:
            entity = wikidata.fetch_entity(el.wikidata_id)
        except ClientError:
            entity = wikidata.EntityData()  # fact-less POI is fine — it won't gate (§8.3)
        source = _wikidata(el.wikidata_id)
        background, background_source = _wikipedia_background(entity.enwiki_title)
        pois.append(
            POI(
                id=f"{el.osm_type}/{el.osm_id}",
                name=el.name,
                location=GeoPoint(lat=el.lat, lon=el.lon),
                facts=[Fact(key=k, value=v, source=source) for k, v in entity.facts.items()],
                background=background,
                background_source=background_source,
            )
        )
    return pois


def candidates(near: GeoPoint, distance_km: float, allow_seed_fallback: bool = True) -> list[POI]:
    """Return candidate POIs near a start point.

    Uses the live OSM/Wikidata pipeline when ``poi_source == "live"``, falling
    back to the bundled Haarlem seed set on any upstream failure — unless
    ``allow_seed_fallback`` is False (e.g. for a geocoded place where falling
    back to Haarlem stops would be a content-accuracy violation).
    """
    if settings.poi_source == "live":
        try:
            live = _fetch_live(near, distance_km)
            if live:
                return live
            _seed_or_not = "using seed set" if allow_seed_fallback else "no seed fallback"
            logger.warning("live POI source returned nothing; %s", _seed_or_not)
        except ClientError as exc:
            _seed_or_not = "using seed set" if allow_seed_fallback else "no seed fallback"
            logger.warning("live POI source failed (%s); %s", exc, _seed_or_not)
    if not allow_seed_fallback:
        return []
    return list(_HAARLEM_POIS)
