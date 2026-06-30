"""POI catalog endpoint — candidate POIs near a point (studio route editor)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.schemas import POI, GeoPoint
from app.services import poi_service

router = APIRouter(prefix="/pois", tags=["pois"])


@router.get("", response_model=list[POI])
def list_pois(
    lat: float = Query(...),
    lon: float = Query(...),
    distance_km: float = Query(5, ge=1, le=25),
) -> list[POI]:
    """Candidate POIs near a start point (seed set offline, OSM/Wikidata live)."""
    return poi_service.candidates(GeoPoint(lat=lat, lon=lon), distance_km)
