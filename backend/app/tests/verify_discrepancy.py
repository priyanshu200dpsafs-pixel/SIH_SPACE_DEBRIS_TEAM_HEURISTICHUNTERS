import json
import numpy as np
from datetime import datetime, timedelta
from sgp4.api import Satrec, WGS84, jday
import math

def load_sat(norad_id):
    with open('../data/cache/active_tles.json') as f: data = json.load(f)
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
            sat.sgp4init(WGS84, 'i', int(norad_id), epoch_days, record.get('BSTAR', 0.0), record.get('MEAN_MOTION_DOT', 0.0) * rev2radmin2, record.get('MEAN_MOTION_DDOT', 0.0) * rev2radmin3, record.get('ECCENTRICITY', 0.0), record.get('ARG_OF_PERICENTER', 0.0) * deg2rad, record.get('INCLINATION', 0.0) * deg2rad, record.get('MEAN_ANOMALY', 0.0) * deg2rad, record.get('MEAN_MOTION', 0.0) * rev2radmin, record.get('RA_OF_ASC_NODE', 0.0) * deg2rad)
            return sat

id1, id2 = 58299, 59046
sat1 = load_sat(id1)
sat2 = load_sat(id2)

# The exact time printed in logs, but what was the actual time in the pipeline?
# In the pipeline, target_time = now + timedelta(seconds=...)
# Let's assume `now` had 935000 microseconds (just as an example)
base_t = datetime(2026, 8, 20, 13, 12, 33)

print("--- Manual vs Pipeline Precision Discrepancy Check ---")
print("Object Pair: AETHER-2 (58299) vs STARLINK-31205 (59046)")

for ms in [0, 935000]:  # 0 is manual check, 935000 simulates an arbitrary `now` microsecond offset
    t_ms = base_t + timedelta(microseconds=ms)
    jd, fr = jday(t_ms.year, t_ms.month, t_ms.day, t_ms.hour, t_ms.minute, t_ms.second + t_ms.microsecond * 1e-6)
    _, r1, _ = sat1.sgp4(jd, fr)
    _, r2, _ = sat2.sgp4(jd, fr)
    dist = np.linalg.norm(np.array(r1) - np.array(r2))
    label = "Manual Script (Truncated Timestamp)" if ms == 0 else "Main Pipeline (Exact Internal Timestamp)"
    print(f"\n{label}:")
    print(f"  Timestamp Passed to jday(): {t_ms.strftime('%Y-%m-%d %H:%M:%S.%f UTC')}")
    print(f"  Sat 1 Cartesian (x,y,z): {r1[0]:.2f}, {r1[1]:.2f}, {r1[2]:.2f}")
    print(f"  Sat 2 Cartesian (x,y,z): {r2[0]:.2f}, {r2[1]:.2f}, {r2[2]:.2f}")
    print(f"  Resulting Euclidean Distance: {dist:.4f} km")
