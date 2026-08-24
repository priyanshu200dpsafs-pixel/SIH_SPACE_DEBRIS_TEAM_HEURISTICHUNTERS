from fastapi import APIRouter
import json
import os
from datetime import datetime

router = APIRouter()

def format_tle(omm_item):
    name = omm_item.get("OBJECT_NAME", "UNKNOWN")
    norad_raw = omm_item.get("NORAD_CAT_ID", 0)
    sat_num = str(norad_raw).rjust(5, "0")
    classification = omm_item.get("CLASSIFICATION_TYPE", "U")
    obj_id = omm_item.get("OBJECT_ID", "00000")
    
    # Format intl designator for TLE (max 8 chars, e.g., '23064AF ')
    # If obj_id is '2023-064AF', convert to '23064AF '
    parts = str(obj_id).split('-')
    if len(parts) == 2 and len(parts[0]) == 4:
        intl_tle = f"{parts[0][2:]}{parts[1]}".ljust(8, ' ')
    else:
        intl_tle = str(obj_id)[:8].ljust(8, ' ')

    epoch_str = omm_item.get("EPOCH")
    try:
        dt = datetime.fromisoformat(epoch_str)
        year2 = str(dt.year)[-2:]
        day_of_year = dt.timetuple().tm_yday
        fraction_of_day = (dt.hour*3600 + dt.minute*60 + dt.second + dt.microsecond/1e6) / 86400
        epoch = f"{year2}{day_of_year:03d}.{str(fraction_of_day)[2:10].ljust(8, '0')}"
    except Exception:
        epoch = "00000.00000000"
    
    ndot = " .00000000"
    nddot = " 00000-0"
    bstar = " 00000-0"
    
    ephem = str(omm_item.get("EPHEMERIS_TYPE", 0))
    element_set = str(omm_item.get("ELEMENT_SET_NO", 999)).rjust(4, " ")
    
    line1 = f"1 {sat_num}{classification} {intl_tle} {epoch} {ndot} {nddot} {bstar} {ephem} {element_set}0"
    
    inc_val = omm_item.get('INCLINATION', 0.0)
    ra_val = omm_item.get('RA_OF_ASC_NODE', 0.0)
    ecc_raw = omm_item.get('ECCENTRICITY', 0.0)
    argp_val = omm_item.get('ARG_OF_PERICENTER', 0.0)
    ma_val = omm_item.get('MEAN_ANOMALY', 0.0)
    mm_val = omm_item.get('MEAN_MOTION', 0.0)
    
    inc = f"{inc_val:8.4f}".rjust(8, " ")
    ra = f"{ra_val:8.4f}".rjust(8, " ")
    ecc = f"{ecc_raw:.7f}"[2:9].ljust(7, "0")
    argp = f"{argp_val:8.4f}".rjust(8, " ")
    ma = f"{ma_val:8.4f}".rjust(8, " ")
    mm = f"{mm_val:11.8f}".rjust(11, " ")
    rev = str(omm_item.get("REV_AT_EPOCH", 0))[-5:].rjust(5, "0")
    
    line2 = f"2 {sat_num} {inc} {ra} {ecc} {argp} {ma} {mm}{rev}0"
    
    # Heuristic metadata
    name_upper = name.upper()
    is_debris = any(k in name_upper for k in ["DEB", "DEBRIS", "R/B", "ROCKET BODY", "FRAGMENT"])
    
    country = "United States of America"
    if any(k in name_upper for k in ["COSMOS", "GLONASS", "SOYUZ", "FREGAT", "BREEZE", "PROGRESS"]):
        country = "Russia"
    elif any(k in name_upper for k in ["BEIDOU", "CZ-", "CHANG ZHENG", "YAOGAN", "GAOFEN", "SHIYAN", "TIANZHOU"]):
        country = "China"
    elif any(k in name_upper for k in ["GALILEO", "SENTINEL", "METOP", "ENVISAT", "ARIANE"]):
        country = "European Space Agency"
    elif any(k in name_upper for k in ["ONEWEB"]):
        country = "United Kingdom"
    elif any(k in name_upper for k in ["IRIDIUM"]):
        country = "United States of America"
    elif any(k in name_upper for k in ["HIMAWARI", "QZS", "H-2", "H-II"]):
        country = "Japan"
    elif any(k in name_upper for k in ["IRS", "INSAT", "GSAT", "PSLV", "GSLV"]):
        country = "India"

    # Launch site heuristic
    launch_site = "Cape Canaveral / Kennedy Space Center"
    if "STARLINK" in name_upper:
        launch_site = "Cape Canaveral SFS / Vandenberg SFB"
    elif country == "Russia":
        launch_site = "Plesetsk Cosmodrome / Baikonur"
    elif country == "China":
        launch_site = "Jiuquan / Xichang Satellite Launch Center"
    elif country == "European Space Agency":
        launch_site = "Guiana Space Centre, Kourou"
    elif country == "India":
        launch_site = "Satish Dhawan Space Centre, Sriharikota"

    # Orbit Type heuristic based on mean motion (rev/day)
    # LEO: > 11.25 rev/day (period < 128 min, alt < 2000 km)
    # MEO: 2 to 11.25 rev/day (GPS, Galileo, Glonass)
    # GEO: ~1.0027 rev/day (alt ~35786 km)
    # HEO: highly eccentric (eccentricity > 0.25)
    if ecc_raw > 0.25:
        orbit_type = "HEO"
    elif mm_val > 11.25:
        orbit_type = "LEO"
    elif 0.95 <= mm_val <= 1.05:
        orbit_type = "GEO"
    elif mm_val > 1.05:
        orbit_type = "MEO"
    else:
        orbit_type = "Other"

    # Launch date estimation from international designator year
    launch_date = "Unavailable"
    if len(parts) == 2 and len(parts[0]) == 4:
        launch_date = f"{parts[0]}-01-01"

    return {
        "name": name,
        "norad_id": sat_num,
        "intl_designator": str(obj_id),
        "epoch": epoch_str,
        "tle_line1": line1,
        "tle_line2": line2,
        "inclination": inc_val,
        "raan": ra_val,
        "eccentricity": ecc_raw,
        "arg_perigee": argp_val,
        "mean_anomaly": ma_val,
        "mean_motion": mm_val,
        "country": country,
        "launch_site": launch_site,
        "launch_date": launch_date,
        "orbit_type": orbit_type,
        "satellite_type": "Debris" if is_debris else "Payload",
        "status": "Operational" if not is_debris else "Defunct/Debris"
    }

@router.get("")
async def get_globe_data(limit: int = 16000):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cache_file = os.path.join(current_dir, "../../data/cache/active_tles.json")
    
    tles = []
    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            data = json.load(f)
            for item in data[:limit]:
                tles.append(format_tle(item))
                
    return {"items": tles}
