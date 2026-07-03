"""Draft trail CRUD for the studio route editor."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CustomStopRequest,
    DraftCreate,
    DraftStatus,
    DraftTrail,
    DraftUpdate,
    StopContentUpdate,
    StopGenerateRequest,
    StopGenerateResult,
    ValidationResult,
)
from app.services import draft_service

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("", response_model=DraftTrail, status_code=201)
def create_draft(req: DraftCreate) -> DraftTrail:
    return draft_service.create(req)


@router.get("", response_model=list[DraftTrail])
def list_drafts() -> list[DraftTrail]:
    return draft_service.list_drafts()


@router.get("/{draft_id}", response_model=DraftTrail)
def get_draft(draft_id: str) -> DraftTrail:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/{draft_id}", response_model=DraftTrail)
def update_draft(draft_id: str, req: DraftUpdate) -> DraftTrail:
    draft = draft_service.update(draft_id, req)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.post("/{draft_id}/stops", response_model=DraftTrail, status_code=201)
def create_custom_stop(draft_id: str, req: CustomStopRequest) -> DraftTrail:
    draft = draft_service.add_custom_stop(
        draft_id, name=req.name, lat=req.lat, lon=req.lon, source_ref=req.source_ref
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/{draft_id}/stops/{order}", response_model=DraftTrail)
def update_stop_content(draft_id: str, order: int, req: StopContentUpdate) -> DraftTrail:
    draft = draft_service.set_stop_content(
        draft_id,
        order,
        story=req.story,
        questions=req.questions,
        primary_question_index=req.primary_question_index,
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft or stop not found")
    return draft


@router.post("/{draft_id}/stops/{order}/generate", response_model=StopGenerateResult)
def generate_stop_content(
    draft_id: str, order: int, req: StopGenerateRequest
) -> StopGenerateResult:
    result = draft_service.generate_stop_content(
        draft_id, order, fact_keys=req.fact_keys, tone=req.tone
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Draft or stop not found")
    story, questions, primary_index = result
    return StopGenerateResult(
        story=story, questions=questions, primary_question_index=primary_index
    )


@router.get("/{draft_id}/validation", response_model=ValidationResult)
def get_validation(draft_id: str) -> ValidationResult:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft_service.validate(draft)


@router.post("/{draft_id}/publish", response_model=DraftTrail)
def publish_draft(draft_id: str) -> DraftTrail:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    report = draft_service.validate(draft)
    if not report.can_publish:
        raise HTTPException(
            status_code=409,
            detail=f"Kan niet publiceren: {report.blocking} blokkerende issue(s)",
        )
    updated = draft_service.update(draft_id, DraftUpdate(status=DraftStatus.REVIEW))
    assert updated is not None  # draft existed above
    return updated
