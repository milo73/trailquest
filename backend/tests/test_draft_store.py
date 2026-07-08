from app.cache.store import FileDraftStore, InMemoryDraftStore
from app.models.schemas import POI, DraftStop, DraftTrail, GeoPoint


def _draft(draft_id: str = "d1") -> DraftTrail:
    return DraftTrail(
        id=draft_id,
        title="Nieuwe tocht",
        city="Haarlem",
        theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63),
        requested_distance_km=5,
        actual_distance_km=1.2,
        estimated_duration_min=20,
        stops=[
            DraftStop(
                order=1,
                poi=POI(id="p1", name="Grote Markt", location=GeoPoint(lat=52.38, lon=4.63)),
            )
        ],
    )


def test_memory_roundtrip_and_list():
    store = InMemoryDraftStore()
    store.put(_draft("a"))
    store.put(_draft("b"))
    assert store.get("a").title == "Nieuwe tocht"
    assert {d.id for d in store.list_drafts()} == {"a", "b"}
    assert store.get("missing") is None


def test_file_store_persists_across_instances(tmp_path):
    FileDraftStore(str(tmp_path)).put(_draft("a"))
    # a fresh instance pointed at the same dir sees it
    reopened = FileDraftStore(str(tmp_path))
    assert reopened.get("a").id == "a"
    assert [d.id for d in reopened.list_drafts()] == ["a"]


def test_route_geometry_survives_the_put_get_roundtrip():
    """The walking path must not be dropped by record normalization/hydration.

    Regression: DraftRecord lacked route_geometry, so reopening a draft
    (any put->get) silently degraded the map to straight lines.
    """
    d = _draft("geo")
    d.route_geometry = [GeoPoint(lat=52.38, lon=4.63), GeoPoint(lat=52.39, lon=4.64)]
    store = InMemoryDraftStore()
    store.put(d)
    got = store.get("geo")
    assert got is not None
    assert got.route_geometry == d.route_geometry


def test_route_geometry_survives_file_store_restart(tmp_path):
    d = _draft("geo")
    d.route_geometry = [GeoPoint(lat=52.38, lon=4.63)]
    FileDraftStore(str(tmp_path)).put(d)
    reopened = FileDraftStore(str(tmp_path)).get("geo")
    assert reopened is not None
    assert reopened.route_geometry == d.route_geometry
