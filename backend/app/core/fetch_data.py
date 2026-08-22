import os
import json
import logging
import requests
from typing import List, Dict, Any

logger = logging.getLogger("fetch_data")

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json"
# We define the cache file relative to the root of the backend folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_FILE = os.path.join(BASE_DIR, "app", "data", "cache", "active_tles.json")

def fetch_latest_tles() -> List[Dict[str, Any]]:
    """
    Fetches the latest live General Perturbations (GP) TLEs from CelesTrak.
    Implements a strict fallback to the local cache if the live API rate-limits
    or times out, ensuring the pipeline never crashes due to upstream issues.
    """
    headers = {
        "User-Agent": "SpaceDebrisTracker-HackathonApp/1.0",
        "Accept": "application/json"
    }

    try:
        logger.info(f"Attempting to fetch live TLEs from {CELESTRAK_URL}")
        response = requests.get(CELESTRAK_URL, headers=headers, timeout=15.0)
        response.raise_for_status()
        
        data = response.json()
        
        # Ensure cache directory exists before writing
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
            
        logger.info(f"Successfully fetched {len(data)} TLEs from CelesTrak and updated cache.")
        return data
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"Live CelesTrak fetch failed ({e}). Falling back to cached TLE data.")
        
        # Fallback to cache
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    data = json.load(f)
                logger.info(f"Successfully loaded {len(data)} TLEs from fallback cache.")
                return data
            except Exception as cache_err:
                logger.error(f"Failed to read from cache file: {cache_err}")
                return []
        else:
            logger.error("No live data available and no cache file exists! Pipeline cannot proceed.")
            return []
