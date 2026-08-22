from fastapi import APIRouter
import json
import os
from datetime import datetime

router = APIRouter()

def format_tle(omm_item):
    name = omm_item.get("OBJECT_NAME", "UNKNOWN")
    sat_num = str(omm_item.get("NORAD_CAT_ID", 0)).rjust(5, "0")
    classification = omm_item.get("CLASSIFICATION_TYPE", "U")
    
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
    
    line1 = f"1 {sat_num}{classification} 00000    {epoch} {ndot} {nddot} {bstar} {ephem} {element_set}0"
    
    inc = f"{omm_item.get('INCLINATION', 0):8.4f}".rjust(8, " ")
    ra = f"{omm_item.get('RA_OF_ASC_NODE', 0):8.4f}".rjust(8, " ")
    ecc_raw = omm_item.get('ECCENTRICITY', 0)
    ecc = f"{ecc_raw:.7f}"[2:9].ljust(7, "0")
    argp = f"{omm_item.get('ARG_OF_PERICENTER', 0):8.4f}".rjust(8, " ")
    ma = f"{omm_item.get('MEAN_ANOMALY', 0):8.4f}".rjust(8, " ")
    mm = f"{omm_item.get('MEAN_MOTION', 0):11.8f}".rjust(11, " ")
    rev = str(omm_item.get("REV_AT_EPOCH", 0))[-5:].rjust(5, "0")
    
    line2 = f"2 {sat_num} {inc} {ra} {ecc} {argp} {ma} {mm}{rev}0"
    
    return {
        "name": name,
        "norad_id": sat_num,
        "epoch": epoch_str,
        "tle_line1": line1,
        "tle_line2": line2
    }

@router.get("")
async def get_globe_data():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cache_file = os.path.join(current_dir, "../../data/cache/active_tles.json")
    
    tles = []
    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            data = json.load(f)
            # Limit to top 500 for performance
            for item in data[:500]:
                tles.append(format_tle(item))
                
    return {"items": tles}
