import re
from collections import defaultdict
import statistics

distances = []
exact_dups = defaultdict(int)

# Read the log file from the previous background task
log_file = '/Users/priyanshu/.gemini/antigravity-ide/brain/11e7e704-f162-4f6e-9284-f0913f33821f/.system_generated/tasks/task-196.log'

with open(log_file, 'r') as f:
    for line in f:
        if 'Min Dist:' in line:
            # Min Dist: 28.11 km @ 2026-08-20 13:12:33 UTC
            m = re.search(r'Min Dist: ([0-9\.]+) km', line)
            if m:
                d = float(m.group(1))
                distances.append(d)
                exact_dups[d] += 1

if not distances:
    print("No distances found in log.")
else:
    print(f"Total logged pairs: {len(distances)}")
    print(f"Min: {min(distances):.2f}")
    print(f"Max: {max(distances):.2f}")
    print(f"Mean: {statistics.mean(distances):.2f}")
    print(f"Median: {statistics.median(distances):.2f}")
    
    # Count duplicates
    dup_count = sum(1 for v, c in exact_dups.items() if c > 1)
    most_common = sorted(exact_dups.items(), key=lambda x: x[1], reverse=True)[:10]
    
    print(f"Number of exact-duplicate distance values (to 2 decimals): {dup_count}")
    print("Top 10 most common distances:")
    for v, c in most_common:
        print(f"  {v:.2f} km appeared {c} times")
