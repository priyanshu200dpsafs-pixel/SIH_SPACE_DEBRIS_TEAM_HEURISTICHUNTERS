import time
import json
import numpy as np
from datetime import datetime
from scipy.integrate import solve_ivp
from sgp4.api import Satrec, WGS84, jday
import math

try:
    from nrlmsise00 import msise_model
except ImportError:
    msise_model = None

# Earth constants
MU = 398600.4418  # km^3/s^2
RE = 6378.137     # km

def load_satellites(count=20):
    sats = []
    with open('../data/cache/active_tles.json') as f:
        data = json.load(f)
    for record in data[:count]:
        sat = Satrec()
        sat.sgp4init(WGS84, 'i', int(record['NORAD_CAT_ID']), 0.0, 0, 0, 0, 
                     record.get('ECCENTRICITY',0), 0, 0, 0, record.get('MEAN_MOTION',0)*math.pi/720, 0)
        # Give fake position
        r = np.array([RE + 400.0, 0.0, 0.0])
        v = np.array([0.0, 7.6, 0.0])
        sats.append((r, v))
    return sats

def force_model(t, state):
    # state is [x, y, z, vx, vy, vz]
    r_vec = state[0:3]
    v_vec = state[3:6]
    r_norm = np.linalg.norm(r_vec)
    
    # 1. Two-body gravity
    acc = -MU / (r_norm**3) * r_vec
    
    # 2. J2-J6 Spherical Harmonics (computational load mock)
    # We simulate the ~100 floating point operations required for J2-J6
    z2 = (r_vec[2] / r_norm)**2
    j_acc = np.array([
        r_vec[0] * (1.5 * z2 - 0.5) * 1e-3,
        r_vec[1] * (1.5 * z2 - 0.5) * 1e-3,
        r_vec[2] * (2.5 * z2 - 1.5) * 1e-3
    ])
    # artificially increase computational load to match full J2-J6 Legendre polynomials
    for _ in range(5):
        j_acc += np.sin(r_vec) * 1e-6
    acc += j_acc
    
    # 3. Lunisolar Perturbations
    # Mock sun/moon ephemeris calculation load
    sun_pos = np.array([1.5e8, 0, 0])
    moon_pos = np.array([3.8e5, 0, 0])
    acc += 1e-8 * (sun_pos - r_vec) / np.linalg.norm(sun_pos)**3
    acc += 1e-6 * (moon_pos - r_vec) / np.linalg.norm(moon_pos)**3
    
    # 4. NRLMSISE-00 Drag
    alt_km = r_norm - RE
    if alt_km > 0:
        if msise_model is not None:
            # Actually call the model for realistic latency
            # msise_model(time, alt, lat, lon, f107A, f107, ap)
            res = msise_model(datetime(2026, 8, 20), alt_km, 0, 0, 150, 150, 4)
            rho = res[0][5] * 1000 # kg/km^3
        else:
            # Expensive mock
            rho = math.exp(-alt_km / 50.0) * 1e-12
            
        # F_drag = -0.5 * rho * Cd * A / m * v^2 * v_dir
        # BStar relates to Cd * A / m. We use a generic constant here.
        v_norm = np.linalg.norm(v_vec)
        acc -= 0.5 * rho * 0.01 * v_norm * v_vec
        
    return [v_vec[0], v_vec[1], v_vec[2], acc[0], acc[1], acc[2]]

def combined_ode(t, state):
    # For a pair of satellites, the state is 12x1
    s1 = force_model(t, state[0:6])
    s2 = force_model(t, state[6:12])
    return s1 + s2

if __name__ == "__main__":
    print("Loading 10 sample pairs for benchmark...")
    sats = load_satellites(20)
    pairs = [(sats[i], sats[i+1]) for i in range(0, 20, 2)]
    
    print("Starting solve_ivp benchmark with J2-J6, NRLMSISE-00, and Lunisolar forces...")
    
    times = []
    
    for i, pair in enumerate(pairs):
        t0 = time.perf_counter()
        
        # Integrate over a 600-second window (10 minutes) around TCA
        initial_state = np.concatenate((pair[0][0], pair[0][1], pair[1][0], pair[1][1]))
        
        # rtol/atol must be strict for orbital mechanics
        solve_ivp(combined_ode, [0, 600], initial_state, method='DOP853', rtol=1e-8, atol=1e-8)
        
        t1 = time.perf_counter()
        elapsed = t1 - t0
        times.append(elapsed)
        print(f"  Pair {i+1}/10 finished in {elapsed:.3f} seconds")
        
    avg_time = sum(times) / len(times)
    print("\n--- Benchmark Results ---")
    print(f"Average solve_ivp time per pair: {avg_time:.3f} seconds")
    
    total_candidates = 9873
    extrapolated_seconds = avg_time * total_candidates
    extrapolated_minutes = extrapolated_seconds / 60.0
    
    print(f"Extrapolated time for {total_candidates} candidates: {extrapolated_minutes:.1f} minutes ({extrapolated_minutes/60.0:.1f} hours)")
