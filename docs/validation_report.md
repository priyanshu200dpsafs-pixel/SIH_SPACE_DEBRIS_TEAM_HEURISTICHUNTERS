# ARES Scientific Verification & Validation Report

## 1. Baseline Snapshot
- **git_commit**: frozen-baseline-2026
- **python_version**: 3.10.12
- **scipy_version**: 1.11.1
- **notes**: No production physics tuned to force a match.

---
## 2. Scorecard

### PROPAGATION
**Classification**: REFERENCE UNAVAILABLE
**Reference**: Orekit (Missing Dependency)
**Sample Size**: 0

- mean_position_error_km: N/A
- mean_velocity_error_kms: N/A
- max_position_error_km: N/A

*Limitations: Requires an independent high-precision reference (e.g. Orekit). Cannot install 'orekit' via standard pip in this environment. Cannot validate ARES SGP4 against itself.*

---
### TCA
**Classification**: REFERENCE UNAVAILABLE
**Reference**: Orekit / Independent Implementation
**Sample Size**: 0

- mean_absolute_error_sec: N/A
- median_absolute_error_sec: N/A
- 95th_percentile_error_sec: N/A
- max_error_sec: N/A

*Limitations: Blocked by missing independent propagation reference.*

---
### MISS DISTANCE
**Classification**: REFERENCE UNAVAILABLE
**Reference**: Independent Implementation
**Sample Size**: 0

- mae_m: N/A
- median_absolute_error_m: N/A
- 95th_percentile_m: N/A

*Limitations: Blocked by missing independent propagation reference.*

---
### PC ALGORITHM
**Classification**: CROSS-CHECKED
**Reference**: Chan 1997 Analytical (Internal)
**Sample Size**: 1

- foster_vs_chan_agreement_fraction: 1/1
- median_log10_divergence: 0.5
- worst_case_divergence: 0.5

*Limitations: METHOD CROSS-CHECK ONLY. Foster numerical integration aligns with Chan analytical approximation. Does NOT prove operational correctness.*

---
### HISTORICAL CDM
**Classification**: REFERENCE UNAVAILABLE
**Reference**: Space Force / CARA Public CDMs
**Sample Size**: 0

- mae_log10_pc: N/A
- within_1_log10: N/A

*Limitations: No historical CDM truth corpus is locally available in the repository to replay.*

---
### NUMERICAL STABILITY
**Classification**: VERIFIED
**Reference**: Analytical Invariant
**Sample Size**: 7

- nan_failures: 0
- negative_pc_failures: 0
- lowest_stable_pc: 1e-35

*Limitations: Log-space Pc computation remained numerically stable across extreme stress-tests down to 1e-35 without artificial flooring or collapse. Validates numerical stability, NOT absolute accuracy.*

---
### FILTERING
**Classification**: PRELIMINARY
**Reference**: Internal Curated Corpus
**Sample Size**: N=4 (N docked=2, N formation=2)

- precision: 1.0
- recall: 1.0
- f1: 1.0

*Limitations: 100% on curated test corpus. Not indicative of broad real-world operational accuracy.*

---
### THREAT RANKING
**Classification**: CROSS-CHECKED
**Reference**: Internal Matrix vs Empirical PC
**Sample Size**: 100

- spearman_correlation: 0.94
- top_10_overlap: 9/10
- top_20_overlap: 18/20

*Limitations: Ranking methodology prioritizes mathematically high-risk events internally, but lacks independent external verification.*

---

## 3. Defensible Claims For Presentation
- **Methodology**: Independent numerical cross-checks are built into the validation framework architecture.
- **Stability**: Log-space Pc computation remained numerically stable in tested extreme-probability regimes (down to $10^{-35}$).
- **Filtering capability**: Implemented automated co-location algorithms that correctly identified structural pairings (e.g. TerraSAR-X, ISS docked vehicles) in our curated preliminary test corpus.
- **Current Status**: ARES is currently undergoing internal method cross-checks; formal independent validation against NASA CARA/Orekit benchmark sets is required before operational deployment.
