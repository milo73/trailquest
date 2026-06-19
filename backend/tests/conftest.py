"""Shared test fixtures."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.cache import active_trails, content_cache
from app.main import app


@pytest.fixture(autouse=True)
def _clear_caches() -> None:
    """Keep tests isolated — the skeleton uses in-memory stores."""
    content_cache.clear()
    active_trails.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
