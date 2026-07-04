"""Draft trail service for the studio (PRD §9.1 creator tooling).

A draft is a creator's work-in-progress: a start point plus an ordered list of
POI stops. Generated content (story/question) is optional and authored later;
the player only ever sees a published ``Trail`` with fully-grounded ``Stop``s.
"""

from __future__ import annotations

import uuid

from app.cache.store import drafts
from app.clients import ClientError, nominatim
from app.config import settings
from app.models.schemas import (
    POI,
    CheckStatus,
    DraftCreate,
    DraftStop,
    DraftTrail,
    DraftUpdate,
    GeoPoint,
    Question,
    Source,
    StopGrounding,
    TrailRequest,
    ValidationCheck,
    ValidationResult,
)
from app.services import content_service, grounding_service, poi_service, route_service


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
    start = req.start
    city = settings.default_city
    if req.place and req.place.strip():
        try:
            geo = nominatim.geocode(req.place.strip())
        except ClientError as exc:
            raise ValueError(f"Plaats kon niet worden opgezocht: {req.place}") from exc
        if geo is None:
            raise ValueError(f"Plaats '{req.place}' niet gevonden")
        start = GeoPoint(lat=geo.lat, lon=geo.lon)
        city = geo.city
    if start is None:
        start = GeoPoint(lat=settings.default_city_lat, lon=settings.default_city_lon)

    draft = DraftTrail(
        id=str(uuid.uuid4()),
        title=req.title or "Nieuwe tocht",
        city=city,
        theme=req.theme,
        start=start,
        requested_distance_km=req.distance_km,
        actual_distance_km=0.0,
        estimated_duration_min=0,
        stops=[],
    )
    if req.from_concept:
        trail = route_service.generate_trail(
            TrailRequest(
                start=start,
                distance_km=req.distance_km,
                theme=req.theme,
                desired_stops=req.desired_stops,
            ),
            allow_seed_fallback=req.place is None,
        )
        draft.stops = [
            DraftStop(
                order=s.order,
                poi=s.poi,
                story=s.story,
                questions=s.questions,
                primary_question_index=s.primary_question_index,
            )
            for s in trail.stops
        ]
        if req.place and len(draft.stops) < 2:
            raise ValueError(f"Geen geschikte POI's gevonden rond '{req.place}'")
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


def set_stop_content(
    draft_id: str,
    order: int,
    *,
    story: str | None = None,
    questions: list[Question] | None = None,
    primary_question_index: int | None = None,
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    stop = next((s for s in draft.stops if s.order == order), None)
    if stop is None:
        return None
    if story is not None:
        stop.story = story
    if questions is not None:
        stop.questions = questions
        stop.primary_question_index = primary_question_index
    draft.attributions = _attributions(draft.stops)
    drafts.put(draft)
    return draft


def generate_stop_content(
    draft_id: str, order: int, *, fact_keys: list[str] | None = None, tone: str | None = None
) -> tuple[str, list[Question], int, bool] | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    stop = next((s for s in draft.stops if s.order == order), None)
    if stop is None:
        return None
    if fact_keys is None:
        poi = stop.poi
    else:
        selected = [f for f in stop.poi.facts if f.key in set(fact_keys)]
        poi = stop.poi.model_copy(update={"facts": selected})
    return content_service.author_content(poi, draft.theme, tone)


def validate(draft: DraftTrail) -> ValidationResult:
    """Compute the pre-publish report for a draft (PRD: quality is a gate)."""
    stops = draft.stops
    per_stop: list[StopGrounding] = []
    for s in stops:
        source_names = sorted({f.source.name for f in s.poi.facts})
        per_stop.append(
            StopGrounding(
                order=s.order,
                name=s.poi.name,
                grounded=len(s.poi.facts) > 0,
                sources=" · ".join(source_names) if source_names else "geen feiten",
            )
        )

    checks: list[ValidationCheck] = []

    checks.append(
        ValidationCheck(
            id="stops",
            label="Stops",
            detail=f"{len(stops)} stops",
            status=CheckStatus.BLOCKING if len(stops) < 2 else CheckStatus.OK,
        )
    )

    complete = [s for s in stops if s.story and s.story.strip()]
    checks.append(
        ValidationCheck(
            id="content",
            label="Inhoud compleet",
            detail=f"{len(complete)} / {len(stops)} stops hebben verhaal + opdracht",
            status=CheckStatus.BLOCKING if len(complete) < len(stops) else CheckStatus.OK,
        )
    )

    grounded = [s for s in stops if s.poi.facts]
    checks.append(
        ValidationCheck(
            id="grounding",
            label="Grounding",
            detail=f"{len(grounded)} / {len(stops)} stops met verifieerbare feiten",
            status=CheckStatus.BLOCKING if len(grounded) < len(stops) else CheckStatus.OK,
        )
    )

    def _has_gating_primary(s: DraftStop) -> bool:
        return (
            s.primary_question_index is not None
            and 0 <= s.primary_question_index < len(s.questions)
            and s.questions[s.primary_question_index].gates
        )

    gated = [s for s in stops if _has_gating_primary(s)]
    checks.append(
        ValidationCheck(
            id="primary_gate",
            label="Poortvraag",
            detail=f"{len(gated)} / {len(stops)} stops hebben een geldige poortvraag",
            status=CheckStatus.BLOCKING if len(gated) < len(stops) else CheckStatus.OK,
        )
    )

    req = draft.requested_distance_km
    out_of_tolerance = req > 0 and abs(draft.actual_distance_km - req) > 0.15 * req
    checks.append(
        ValidationCheck(
            id="distance",
            label="Afstandstolerantie",
            detail=f"{draft.actual_distance_km} km — doel {req} km (±15%)",
            status=CheckStatus.WARNING if out_of_tolerance else CheckStatus.OK,
        )
    )

    blocking = sum(1 for c in checks if c.status == CheckStatus.BLOCKING)
    warnings = sum(1 for c in checks if c.status == CheckStatus.WARNING)
    return ValidationResult(
        checks=checks,
        per_stop=per_stop,
        blocking=blocking,
        warnings=warnings,
        can_publish=blocking == 0,
    )


def add_custom_stop(
    draft_id: str,
    *,
    name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    source_ref: str | None = None,
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    location = GeoPoint(
        lat=lat if lat is not None else draft.start.lat,
        lon=lon if lon is not None else draft.start.lon,
    )
    if source_ref:
        poi = grounding_service.build_grounded_poi(source_ref, name=name, location=location)
    else:
        poi = POI(
            id=f"custom:{uuid.uuid4()}",
            name=name or "Nieuwe stop",
            location=location,
            facts=[],
        )
    draft.stops.append(DraftStop(order=len(draft.stops) + 1, poi=poi))
    _measure(draft)
    drafts.put(draft)
    return draft
