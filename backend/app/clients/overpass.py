"""OpenStreetMap POI retrieval via the Overpass API (PRD §10).

Returns raw POI candidates near a point. Only elements that carry a `wikidata`
tag are requested — those are the ones we can attach verifiable ground truth to
(PRD §8.1). OSM attribution (ODbL) is required wherever this data is used.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.clients import ClientError
from app.config import settings

# Elements must have a name and a wikidata tag, and be a recognizable feature.
_QUERY_TEMPLATE = """
[out:json][timeout:25];
nwr(around:{radius},{lat},{lon})[wikidata][name][~"^(tourism|historic|amenity|building|man_made|leisure)$"~"."];
out center tags {limit};
"""


@dataclass(frozen=True)
class OverpassPOI:
    osm_type: str  # node | way | relation
    osm_id: int
    name: str
    lat: float
    lon: float
    wikidata_id: str  # e.g. "Q1542249"


def fetch_pois(lat: float, lon: float, radius_m: int, limit: int = 60) -> list[OverpassPOI]:
    """Fetch named, Wikidata-linked POIs within ``radius_m`` of (lat, lon)."""
    query = _QUERY_TEMPLATE.format(radius=radius_m, lat=lat, lon=lon, limit=limit)
    try:
        resp = httpx.post(
            settings.overpass_url,
            data={"data": query},
            timeout=settings.http_timeout,
            headers={"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"},
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
    except (httpx.HTTPError, ValueError) as exc:  # ValueError covers JSON decode
        raise ClientError(f"Overpass request failed: {exc}") from exc

    pois: list[OverpassPOI] = []
    for el in elements:
        tags = el.get("tags", {})
        name, wikidata_id = tags.get("name"), tags.get("wikidata")
        if not name or not wikidata_id:
            continue
        # Nodes carry lat/lon directly; ways/relations carry a computed center.
        center = el.get("center", el)
        if "lat" not in center or "lon" not in center:
            continue
        pois.append(
            OverpassPOI(
                osm_type=el.get("type", "node"),
                osm_id=int(el.get("id", 0)),
                name=name,
                lat=float(center["lat"]),
                lon=float(center["lon"]),
                wikidata_id=wikidata_id,
            )
        )
    return pois
