"""Single source of truth for Singapore zone thresholds.

Zones are rough drive-time regions, not official planning areas:
  North: lat >= 1.405 (Woodlands, Yishun, Sembawang…)
  South: lat <= 1.275 (Sentosa, harbourfront…)
  East:  lng >= 103.88 (Tampines, Bedok, Marine Parade, Paya Lebar, Hougang…)
  West:  lng <= 103.745 (Jurong, Tuas, Bukit Batok…)
  Central: everything else inside the SG bbox.

Keep js/home-postal.js zoneFromLatLng in sync with these numbers.
"""

SG_BBOX = (1.15, 1.48, 103.6, 104.1)

NORTH_LAT = 1.405
SOUTH_LAT = 1.275
EAST_LNG = 103.88
WEST_LNG = 103.745


def zone_from_latlng(lat, lng, letters=False):
    """Return 'North'/'South'/'East'/'West'/'Central' (or N/S/E/W/C)."""
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    lo_la, hi_la, lo_ln, hi_ln = SG_BBOX
    if not (lo_la <= la <= hi_la and lo_ln <= ln <= hi_ln):
        return None
    if la >= NORTH_LAT:
        z = "N"
    elif la <= SOUTH_LAT:
        z = "S"
    elif ln >= EAST_LNG:
        z = "E"
    elif ln <= WEST_LNG:
        z = "W"
    else:
        z = "C"
    if letters:
        return z
    return {"N": "North", "S": "South", "E": "East", "W": "West", "C": "Central"}[z]
