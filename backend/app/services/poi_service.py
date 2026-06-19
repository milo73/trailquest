"""POI / data service (PRD §9.1).

Fetches and normalizes POIs and their facts from OSM / Wikidata / Wikipedia.
This skeleton returns a small seed set for Haarlem (the first launch city,
PRD §19) with real, source-attributed facts so the rest of the pipeline has
genuine ground truth to work from. Replace :meth:`candidates` with live OSM +
Wikidata queries (with caching) later.
"""

from __future__ import annotations

from app.models.schemas import (
    POI,
    Fact,
    GeoPoint,
    Source,
    SourceLicense,
)


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


def candidates(near: GeoPoint, distance_km: float) -> list[POI]:
    """Return candidate POIs near a start point.

    The skeleton ignores ``near``/``distance_km`` and returns the Haarlem seed
    set; a real implementation queries within a radius derived from the distance.
    """
    return list(_HAARLEM_POIS)
