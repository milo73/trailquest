from app.models.schemas import GeoPoint
from app.services.route_service import measure_loop


def test_empty_points_is_zero():
    assert measure_loop(GeoPoint(lat=52.38, lon=4.63), []) == (0.0, 0)


def test_loop_distance_and_duration_increase_with_points():
    start = GeoPoint(lat=52.380, lon=4.630)
    one = measure_loop(start, [GeoPoint(lat=52.385, lon=4.640)])
    two = measure_loop(
        start, [GeoPoint(lat=52.385, lon=4.640), GeoPoint(lat=52.390, lon=4.650)]
    )
    assert one[0] > 0
    assert two[0] > one[0]  # more stops, longer loop
    assert two[1] > one[1]  # and longer duration


def test_single_point_loop_is_out_and_back():
    start = GeoPoint(lat=52.380, lon=4.630)
    p = GeoPoint(lat=52.385, lon=4.630)
    dist, dur = measure_loop(start, [p])
    assert dist > 0
    assert isinstance(dur, int)
