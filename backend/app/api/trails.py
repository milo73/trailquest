"""Trail generation and answer endpoints — the thin end-to-end vertical."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.cache import active_trails, published_trails
from app.models.schemas import (
    AnswerRequest,
    AnswerResult,
    Trail,
    TrailRequest,
)
from app.services import answer_service, route_service

router = APIRouter(prefix="/trails", tags=["trails"])


def _resolve_trail(trail_id: str) -> Trail | None:
    return published_trails.get(trail_id) or active_trails.get(trail_id)


@router.get("", response_model=list[Trail])
def list_trails() -> list[Trail]:
    return published_trails.list_trails()


@router.post("", response_model=Trail, status_code=201)
def create_trail(req: TrailRequest) -> Trail:
    """Generate a trail (loop) for a start point, distance, and theme."""
    trail = route_service.generate_trail(req)
    if not trail.stops:
        raise HTTPException(
            status_code=422,
            detail="Not enough POIs with verifiable facts near the start point.",
        )
    active_trails.put(trail)
    return trail


@router.get("/{trail_id}", response_model=Trail)
def get_trail(trail_id: str) -> Trail:
    trail = _resolve_trail(trail_id)
    if trail is None:
        raise HTTPException(status_code=404, detail="Trail not found")
    return trail


@router.post("/{trail_id}/answer", response_model=AnswerResult)
def submit_answer(trail_id: str, req: AnswerRequest) -> AnswerResult:
    """Submit an answer for a stop. Gating follows the question's type (PRD §8.2)."""
    trail = _resolve_trail(trail_id)
    if trail is None:
        raise HTTPException(status_code=404, detail="Trail not found")

    stop = next((s for s in trail.stops if s.order == req.stop_order), None)
    if stop is None:
        raise HTTPException(status_code=404, detail="Stop not found")

    idx = req.question_index if req.question_index is not None else stop.primary_question_index
    if not 0 <= idx < len(stop.questions):
        raise HTTPException(status_code=404, detail="Question not found")
    return answer_service.evaluate_in_stop(stop, idx, req.answer, req.attempt)
