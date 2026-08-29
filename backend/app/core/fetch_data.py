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

def fetch_latest_tles() -> tuple[List[Dict[str, Any]], set, str]:
    """
    Fetches the latest live General Perturbations (GP) TLEs from CelesTrak.
    Implements a strict fallback to the local cache if the live API rate-limits
    or times out, ensuring the pipeline never crashes due to upstream issues.
    
    Returns:
        tuple: (tle_data, changed_norad_ids_set, dataset_version)
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
        
        # 1. Diff against old cache
        old_data = []
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    old_data = json.load(f)
            except Exception:
                pass
                
        old_lookup = {rec.get('NORAD_CAT_ID'): rec.get('EPOCH') for rec in old_data if 'NORAD_CAT_ID' in rec}
        changed_ids = set()
        
        for rec in data:
            nid = rec.get('NORAD_CAT_ID')
            if nid not in old_lookup or old_lookup[nid] != rec.get('EPOCH'):
                changed_ids.add(nid)
                
        # Also any objects that were removed
        new_lookup_ids = {rec.get('NORAD_CAT_ID') for rec in data if 'NORAD_CAT_ID' in rec}
        for nid in old_lookup:
            if nid not in new_lookup_ids:
                changed_ids.add(nid)
        
        # Dataset version (max epoch string as a simple version)
        dataset_version = max([r.get('EPOCH', '') for r in data]) if data else "UNKNOWN"
        
        # Ensure cache directory exists before writing
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
            
        logger.info(f"Successfully fetched {len(data)} TLEs from CelesTrak. Found {len(changed_ids)} changed objects.")
        return data, changed_ids, dataset_version
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"Live CelesTrak fetch failed ({e}). Falling back to cached TLE data.")
        
        # Fallback to cache
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    data = json.load(f)
                logger.info(f"Successfully loaded {len(data)} TLEs from fallback cache.")
                dataset_version = max([r.get('EPOCH', '') for r in data]) if data else "UNKNOWN"
                return data, set(), dataset_version
            except Exception as cache_err:
                logger.error(f"Failed to read from cache file: {cache_err}")
                return [], set(), "UNKNOWN"
        else:
            logger.error("No live data available and no cache file exists! Pipeline cannot proceed.")
            return [], set(), "UNKNOWN"
