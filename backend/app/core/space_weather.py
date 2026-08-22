import logging
import requests
import json
import os

logger = logging.getLogger("space_weather")

def get_live_solar_weather():
    """
    Fetches live F10.7 flux and Ap index from NOAA SWPC.
    Falls back to cache or nominal defaults if servers are unreachable.
    """
    f107 = 150.0
    ap = 15.0
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cache_path = os.path.join(current_dir, "..", "data", "cache", "space_weather.json")
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)

    fetched_live = False

    try:
        # Fetch F10.7
        logger.info("Fetching live F10.7 flux from NOAA...")
        r_f107 = requests.get("https://services.swpc.noaa.gov/json/f107_cm_flux.json", timeout=10)
        r_f107.raise_for_status()
        f107_data = r_f107.json()
        if f107_data:
            f107 = float(f107_data[-1].get("flux", 150.0))
            
        # Fetch Kp/Ap
        logger.info("Fetching live Planetary K-index from NOAA...")
        r_kp = requests.get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", timeout=10)
        r_kp.raise_for_status()
        kp_data = r_kp.json()
        if len(kp_data) > 0:
            latest_kp_row = kp_data[-1]
            kp = float(latest_kp_row.get("Kp", 1.0))
            ap = float(latest_kp_row.get("a_running", 15.0))

        # Cache successful fetch
        with open(cache_path, "w") as f:
            json.dump({"f107": f107, "ap": ap}, f)
        logger.info(f"Successfully fetched live solar data: F10.7={f107}, Ap={ap}")
        fetched_live = True

    except Exception as e:
        logger.warning(f"NOAA fetch failed ({e}). Attempting to use local cache...")
        
    if not fetched_live:
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r") as f:
                    cache_data = json.load(f)
                    f107 = cache_data.get("f107", 150.0)
                    ap = cache_data.get("ap", 15.0)
                logger.info(f"Loaded space weather from cache: F10.7={f107}, Ap={ap}")
            except Exception as ce:
                logger.error(f"Failed to read space weather cache ({ce}). Using nominal defaults.")
        else:
            logger.warning("No space weather cache found. Using nominal defaults (F10.7=150.0, Ap=15.0).")
            
    return {"f107": f107, "ap": ap}
