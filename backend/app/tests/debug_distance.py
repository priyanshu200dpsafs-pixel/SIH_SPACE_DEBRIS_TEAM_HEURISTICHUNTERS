import json
import numpy as np
from datetime import datetime
from sgp4.api import Satrec, WGS84, jday
import math

def load_sat(norad_id):
    with open('../data/cache/active_tles.json') as f:
        data = json.load(f)
    for record in data:
        if str(record['NORAD_CAT_ID']) == str(norad_id):
            deg2rad = math.pi / 180.0
            rev2radmin = (2 * math.pi) / 1440.0
            rev2radmin2 = (2 * math.pi) / (1440.0 * 1440.0)
            rev2radmin3 = (2 * math.pi) / (1440.0 ** 3)
            base_epoch = datetime(1949, 12, 31)
            dt_str = record['EPOCH']
            if dt_str.endswith('Z'): dt_str = dt_str[:-1]
            dt = datetime.fromisoformat(dt_str)
            epoch_days = (dt - base_epoch).total_seconds() / 86400.0
            sat = Satrec()
            sat.sgp4init(
                WGS84, 'i', int(norad_id), epoch_days, record.get('BSTAR', 0.0),
                record.get('MEAN_MOTION_DOT', 0.0) * rev2radmin2,
                record.get('MEAN_MOTION_DDOT', 0.0) * rev2radmin3,
                record.get('ECCENTRICITY', 0.0),
                record.get('ARG_OF_PERICENTER', 0.0) * deg2rad,
                record.get('INCLINATION', 0.0) * deg2rad,
                record.get('MEAN_ANOMALY', 0.0) * deg2rad,
                record.get('MEAN_MOTION', 0.0) * rev2radmin,
                record.get('RA_OF_ASC_NODE', 0.0) * deg2rad
            )
            return sat
    return None

targets = [(58299, 59046, '2026-08-20T13:12:33'), (57257, 63703, '2026-08-21T01:32:33')]
for id1, id2, t_str in targets:
    sat1 = load_sat(id1)
    sat2 = load_sat(id2)
    dt = datetime.fromisoformat(t_str)
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
    e1, r1, v1 = sat1.sgp4(jd, fr)
    e2, r2, v2 = sat2.sgp4(jd, fr)
    dist = np.linalg.norm(np.array(r1) - np.array(r2))
    print(f"{id1} vs {id2} at {t_str}: Error1={e1}, Error2={e2}, Dist={dist:.4f} km")
    print(f"  {id1} Pos: {r1}")
    print(f"  {id2} Pos: {r2}")
