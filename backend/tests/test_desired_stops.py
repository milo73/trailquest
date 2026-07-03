from app.models.schemas import POI, DraftCreate, Fact, GeoPoint, Source, SourceLicense, TrailRequest
from app.services import draft_service, route_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


def _poi(i: int) -> POI:
    return POI(
        id=f"p{i}",
        name=f"POI {i}",
        location=GeoPoint(lat=52.38 + i / 1000, lon=4.63),
        facts=[
            Fact(
                key="build_year",
                value=str(1500 + i),
                source=Source(name="Wikidata", license=SourceLicense.CC0, reference=f"q{i}"),
            )
        ],
    )


def test_select_pois_honors_desired_stops():
    candidates = [_poi(i) for i in range(10)]
    assert len(route_service._select_pois(candidates, 5.0, desired_stops=3)) == 3


def test_select_pois_clamps_to_available():
    candidates = [_poi(i) for i in range(3)]
    # asked for more than exist → clamp to the 3 grounded POIs
    assert len(route_service._select_pois(candidates, 5.0, desired_stops=9)) == 3


def test_select_pois_falls_back_to_distance_when_none():
    candidates = [_poi(i) for i in range(10)]
    # distance 5 → round(5)=5 stops, no desired_stops
    assert len(route_service._select_pois(candidates, 5.0)) == 5


def test_draft_create_from_concept_honors_desired_stops():
    draft = draft_service.create(
        DraftCreate(start=HAARLEM, distance_km=5, from_concept=True, desired_stops=3)
    )
    # seed set is small; the count reflects the request clamped to grounded seed POIs
    assert len(draft.stops) <= 3 and len(draft.stops) >= 2


def test_trailrequest_desired_stops_bounds():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TrailRequest(start=HAARLEM, distance_km=5, desired_stops=1)  # below ge=2
