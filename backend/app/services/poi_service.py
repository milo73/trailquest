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

from app.clients import ClientError, overpass, wikidata
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


# Seed POIs for Haarlem. Facts carry their source (PRD §8.1, §10).
_HAARLEM_POIS: list[POI] = [
    POI(
        id="grote-kerk-haarlem",
        name="Grote Kerk (St.-Bavokerk)",
        location=GeoPoint(lat=52.3814, lon=4.6366),
        facts=[
            Fact(key="build_year_start", value="1370", source=_wikidata("Q1542249")),
            Fact(key="height_m", value="78", source=_wikidata("Q1542249")),
            Fact(
                key="architectural_style", value="Brabantine Gothic", source=_wikidata("Q1542249")
            ),
        ],
    ),
    POI(
        id="de-adriaan-windmill",
        name="Molen De Adriaan",
        location=GeoPoint(lat=52.3849, lon=4.6406),
        facts=[
            Fact(key="build_year", value="1779", source=_wikidata("Q1854239")),
            Fact(key="type", value="smock mill", source=_wikidata("Q1854239")),
        ],
    ),
    POI(
        id="frans-hals-museum",
        name="Frans Hals Museum",
        location=GeoPoint(lat=52.3759, lon=4.6320),
        facts=[
            Fact(key="founded_year", value="1862", source=_wikidata("Q574961")),
        ],
    ),
    POI(
        id="teylers-museum",
        name="Teylers Museum",
        location=GeoPoint(lat=52.3796, lon=4.6411),
        facts=[
            Fact(key="founded_year", value="1778", source=_wikidata("Q1318217")),
            Fact(
                key="status", value="oldest museum in the Netherlands", source=_wikidata("Q1318217")
            ),
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


def _fetch_live(near: GeoPoint, distance_km: float) -> list[POI]:
    """Query Overpass for candidates, then enrich each with Wikidata facts."""
    raw = overpass.fetch_pois(near.lat, near.lon, _search_radius_m(distance_km))
    pois: list[POI] = []
    for el in raw:
        try:
            raw_facts = wikidata.fetch_facts(el.wikidata_id)
        except ClientError:
            raw_facts = {}  # a fact-less POI is fine — it just won't gate (PRD §8.3)
        source = _wikidata(el.wikidata_id)
        pois.append(
            POI(
                id=f"{el.osm_type}/{el.osm_id}",
                name=el.name,
                location=GeoPoint(lat=el.lat, lon=el.lon),
                facts=[Fact(key=k, value=v, source=source) for k, v in raw_facts.items()],
            )
        )
    return pois


def candidates(near: GeoPoint, distance_km: float) -> list[POI]:
    """Return candidate POIs near a start point.

    Uses the live OSM/Wikidata pipeline when ``poi_source == "live"``, falling
    back to the bundled Haarlem seed set on any upstream failure.
    """
    if settings.poi_source == "live":
        try:
            live = _fetch_live(near, distance_km)
            if live:
                return live
            logger.warning("live POI source returned nothing; using seed set")
        except ClientError as exc:
            logger.warning("live POI source failed (%s); using seed set", exc)
    return list(_HAARLEM_POIS)
