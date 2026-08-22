import json
import os
import sys

def verify_cdms():
    file_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        "data", "cdm_training", "historical_cdms.json"
    )
    
    if not os.path.exists(file_path):
        print(f"Error: Could not find dataset at {file_path}")
        sys.exit(1)

    print(f"Loading dataset from: {file_path}")
    
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        sys.exit(1)

    if not isinstance(data, list):
        print("Error: Dataset is not a JSON array.")
        sys.exit(1)

    total_records = len(data)
    print(f"\n--- Dataset Summary ---")
    print(f"Total CDMs found: {total_records}")

    required_fields = ['TCA', 'MIN_RNG', 'PC', 'SAT_1_ID', 'SAT_2_ID']
    corrupted_count = 0
    
    highest_pc = -1.0
    highest_risk_event = None

    for record in data:
        is_corrupted = False
        for field in required_fields:
            if field not in record or record[field] is None:
                is_corrupted = True
                break
                
        if is_corrupted:
            corrupted_count += 1
            continue
            
        try:
            pc_value = float(record['PC'])
            if pc_value > highest_pc:
                highest_pc = pc_value
                highest_risk_event = record
        except (ValueError, TypeError):
            corrupted_count += 1
            
    print(f"Corrupted records (missing fields or null): {corrupted_count}")
    print(f"Valid records ready for ML: {total_records - corrupted_count}")

    print("\n--- Highest Risk Conjunction Event ---")
    if highest_risk_event:
        print(json.dumps(highest_risk_event, indent=4))
    else:
        print("No valid risk events found.")

if __name__ == "__main__":
    verify_cdms()
