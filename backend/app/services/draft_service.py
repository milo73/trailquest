"""Draft trail service for the studio (PRD §9.1 creator tooling).

A draft is a creator's work-in-progress: a start point plus an ordered list of
POI stops. Generated content (story/question) is optional and authored later;
the player only ever sees a published ``Trail`` with fully-grounded ``Stop``s.
"""

from __future__ import annotations

import uuid

from app.cache.store import drafts
from app.config import settings
from app.models.schemas import (
    DraftCreate,
    DraftStop,
    DraftTrail,
    DraftUpdate,
    Source,
    TrailRequest,
)
from app.services import content_service, poi_service, route_service


def _attributions(stops: list[DraftStop]) -> list[str]:
    sources: list[Source] = [f.source for s in stops for f in s.poi.facts]
    sources += [s.poi.background_source for s in stops if s.poi.background_source is not None]
    attributions = content_service.collect_attributions(sources)
    osm_attr = "OpenStreetMap (ODbL)"
    if osm_attr not in attributions:
        attributions.append(osm_attr)
    return sorted(attributions)


def _measure(draft: DraftTrail) -> DraftTrail:
    distance, duration = route_service.measure_loop(
        draft.start, [s.poi.location for s in draft.stops]
    )
    draft.actual_distance_km = distance
    draft.estimated_duration_min = duration
    draft.attributions = _attributions(draft.stops)
    return draft


def create(req: DraftCreate) -> DraftTrail:
    draft = DraftTrail(
        id=str(uuid.uuid4()),
        title=req.title or "Nieuwe tocht",
        city=settings.default_city,
        theme=req.theme,
        start=req.start,
        requested_distance_km=req.distance_km,
        actual_distance_km=0.0,
        estimated_duration_min=0,
        stops=[],
    )
    if req.from_concept:
        trail = route_service.generate_trail(
            TrailRequest(start=req.start, distance_km=req.distance_km, theme=req.theme)
        )
        draft.stops = [
            DraftStop(order=s.order, poi=s.poi, story=s.story, question=s.question)
            for s in trail.stops
        ]
    _measure(draft)
    drafts.put(draft)
    return draft


def get(draft_id: str) -> DraftTrail | None:
    return drafts.get(draft_id)


def list_drafts() -> list[DraftTrail]:
    return drafts.list_drafts()


def update(draft_id: str, req: DraftUpdate) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    if req.title is not None:
        draft.title = req.title
    if req.theme is not None:
        draft.theme = req.theme
    if req.status is not None:
        draft.status = req.status
    if req.stop_poi_ids is not None:
        existing = {s.poi.id: s for s in draft.stops}
        catalog = {
            p.id: p for p in poi_service.candidates(draft.start, draft.requested_distance_km)
        }
        new_stops: list[DraftStop] = []
        for i, poi_id in enumerate(req.stop_poi_ids):
            if poi_id in existing:
                stop = existing[poi_id]
                stop.order = i + 1
                new_stops.append(stop)
            elif poi_id in catalog:
                new_stops.append(DraftStop(order=i + 1, poi=catalog[poi_id]))
            # unknown id → skip (degrade rather than break)
        draft.stops = new_stops
    _measure(draft)
    drafts.put(draft)
    return draft
