"""Walking-network routing via an OSRM-compatible server (PRD §7.3).

Distance must be measured over the *walking* path network, not as-the-crow-flies.
This uses OSRM's `trip` service, which solves the stop-ordering (a TSP-style
round trip) and returns the network distance in one call — a good fit for our
loop requirement (start ≈ end). Point the base URL at an OSRM instance running
the foot profile (`TRAILQUEST_OSRM_URL`).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.clients import ClientError
from app.config import settings


@dataclass(frozen=True)
class TripResult:
    order: list[int]  # input point indices in optimized visiting order
    distance_km: float


def optimized_loop(points: list[tuple[float, float]]) -> TripResult:
    """Order ``points`` (lat, lon) into a walking loop and return its distance.

    Uses OSRM `trip` with the foot profile, fixing the first point as the start
    and returning to it (roundtrip). Index 0 is the trail start.
    """
    if len(points) < 2:
        raise ClientError("need at least two points to route")

    # OSRM expects lon,lat order.
    coords = ";".join(f"{lon},{lat}" for lat, lon in points)
    url = f"{settings.osrm_url.rstrip('/')}/trip/v1/foot/{coords}"
    try:
        resp = httpx.get(
            url,
            params={"source": "first", "roundtrip": "true", "overview": "false"},
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "Ok":
            raise ClientError(f"OSRM returned code={data.get('code')}")
        trip = data["trips"][0]
        # waypoints[i].waypoint_index gives the visiting order of input point i.
        order = sorted(range(len(points)), key=lambda i: data["waypoints"][i]["waypoint_index"])
        distance_km = float(trip["distance"]) / 1000.0
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        raise ClientError(f"OSRM request failed: {exc}") from exc

    return TripResult(order=order, distance_km=round(distance_km, 2))
