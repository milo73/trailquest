"""Route measurement endpoint — live loop distance/duration for the studio editor."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import RouteMeasureRequest, RouteMeasureResult
from app.services import route_service

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/measure", response_model=RouteMeasureResult)
def measure(req: RouteMeasureRequest) -> RouteMeasureResult:
    distance_km, duration_min, _ = route_service.measure_loop(req.start, req.points)
    return RouteMeasureResult(distance_km=distance_km, duration_min=duration_min)
