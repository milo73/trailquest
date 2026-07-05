"""Place-name geocoding via Nominatim (OpenStreetMap, ODbL).

Free, no API key; the usage policy REQUIRES a descriptive User-Agent and permits
~1 req/s (fine for interactive creator use). Returns coordinates + a best-effort
place label; never invents a location.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.clients import ClientError
from app.config import settings

_HEADERS = {"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"}


@dataclass(frozen=True)
class GeoResult:
    lat: float
    lon: float
    city: str
    display_name: str


def geocode(query: str) -> GeoResult | None:
    """Geocode a free-text place. None when not found; ClientError on transport/parse failure."""
    try:
        resp = httpx.get(
            settings.nominatim_url,
            params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1},
            timeout=settings.http_timeout,
            headers=_HEADERS,
        )
        resp.raise_for_status()
        results = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Nominatim request failed for {query!r}: {exc}") from exc

    if not results:
        return None
    top = results[0]
    addr = top.get("address", {})
    display = top.get("display_name", query)
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
        or display.split(",")[0].strip()
    )
    return GeoResult(lat=float(top["lat"]), lon=float(top["lon"]), city=city, display_name=display)
