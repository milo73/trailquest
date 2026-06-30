"""FastAPI application entrypoint.

MVP is a modular monolith (PRD §9): one stateless app wiring together the route,
POI/data, content, and gamification modules behind a single API. Run locally with:

    uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import drafts, health, pois, routes, trails
from app.config import settings

app = FastAPI(
    title=settings.app_name,
    summary="AI-generated interactive walking scavenger hunts",
    version="0.1.0",
)

app.include_router(drafts.router)
app.include_router(health.router)
app.include_router(pois.router)
app.include_router(routes.router)
app.include_router(trails.router)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/")
def root() -> dict[str, str]:
    return {"app": settings.app_name, "docs": "/docs"}
