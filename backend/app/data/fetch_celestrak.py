import os
import json
import time
import logging
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

TARGET_URLS = {
    "active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    "starlink": "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    "cosmos_debris": "https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle"
}

def download_celestrak_data():
    # Define the path for the cache directory relative to this script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cache_dir = os.path.join(current_dir, "cache")
    
    # Ensure the cache directory exists
    os.makedirs(cache_dir, exist_ok=True)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }
    
    for key, url in TARGET_URLS.items():
        file_path = os.path.join(cache_dir, f"{key}_tles.txt")
        
        # Skip if we already downloaded it manually or previously
        if os.path.exists(file_path):
            logger.info(f"File {file_path} already exists. Skipping download for {key}.")
            continue
            
        logger.info(f"Downloading data for {key}...")
        for attempt in range(3):
            try:
                response = requests.get(url, headers=headers, timeout=60)
                response.raise_for_status()  # Check for HTTP errors
                
                data = response.json()
                
                file_path = os.path.join(cache_dir, f"{key}_tles.txt")
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                    
                logger.info(f"Successfully downloaded {len(data):,} items for {key}")
                break  # Success, break the retry loop
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Attempt {attempt + 1} failed to download data for {key}: {e}")
                time.sleep(5) # Wait before retry
            except ValueError as e:
                logger.error(f"Failed to parse JSON response for {key}: {e}")
                break # Don't retry on bad json
                
        time.sleep(5)  # Add delay between distinct dataset requests to avoid rate limits

if __name__ == "__main__":
    download_celestrak_data()
