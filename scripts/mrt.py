"""Beanie Day — nearest MRT station lookup (build-time stamping).

Data: data/mrt-stations.json (146 stations, lat/lng sourced from LTA datasets
via ayaka14732/singapore-hdb-map, Singapore Open Data Licence).
"""
import json
import math
import os

_STATIONS = None


def _data_path():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "mrt-stations.json")


def load_stations():
    global _STATIONS
    if _STATIONS is None:
        with open(_data_path()) as f:
            _STATIONS = json.load(f)["stations"]
    return _STATIONS


def _haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def nearest_mrt(lat, lng):
    """Return (station_name, km) for the closest MRT station, or (None, None)."""
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return None, None
    best = None
    best_km = None
    for s in load_stations():
        km = _haversine_km(lat, lng, s["lat"], s["lng"])
        if best_km is None or km < best_km:
            best_km = km
            best = s["name"]
    if best is None:
        return None, None
    return best, round(best_km, 1)


def stamp_nearest_mrt(travel):
    """Stamp travel['nearestMrt'] in place. travel must have lat/lng."""
    if not isinstance(travel, dict):
        return travel
    name, _km = nearest_mrt(travel.get("lat"), travel.get("lng"))
    if name:
        travel["nearestMrt"] = name
    return travel
