"""Draft trail CRUD for the studio route editor."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import DraftCreate, DraftTrail, DraftUpdate
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
