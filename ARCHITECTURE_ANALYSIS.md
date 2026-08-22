# Space Debris Tracker: Architecture & Algorithmic Analysis

This document provides a comprehensive, deep-dive analysis of the Space Debris Tracker project. It covers the data pipeline, the mathematical formulas, the algorithms at each stage, and a detailed breakdown of how raw satellite data is transformed into actionable Probability of Collision (Pc) metrics.

---

## 1. Project Overview & Data Flow

**Goal:** Predict and assess the risk of collisions (conjunctions) between active satellites and space debris in Earth's orbit.

**Input Data:** 
- The pipeline begins with **Two-Line Element (TLE)** sets, sourced primarily from CelesTrak (via `fetch_celestrak.py`). 
- TLEs contain the mean orbital elements of a satellite at a specific epoch (time).
- The raw data is cached locally as a JSON array (e.g., `active_tles.json`).
- Supplementary input data includes historical Conjunction Data Messages (CDMs) used strictly for model backtesting and validation.

**Pipeline Stages:**
When a user or a cron job triggers the system, the data flows through four distinct stages:
1. **Stage 1 & 2:** SGP4 Propagation & Spatial Screening (KD-Tree)
2. **Stage 3:** High-Fidelity Numerical Refinement & Co-Location Filtering
3. **Stage 4:** Covariance Generation & Foster 2D Probability of Collision (Pc) Integration

**Languages & Technologies:**
- **Language:** Python
- **Core Libraries:** `numpy` (matrix operations), `scipy` (KD-Trees, ODE integration, Gauss-Legendre Quadrature), `sgp4` (standard orbital propagation), `nrlmsise00` (atmospheric density).

---

## 2. Detailed Stage-by-Stage Breakdown

### Stage 1 & 2: Fast Spatial Screening (`spatial_index.py`)
Because there are tens of thousands of tracked objects in orbit, doing heavy physics on every possible pair (N^2 problem) is computationally impossible. This stage acts as a broad sieve.

* **Algorithm & Logic:**
  - **SGP4 Propagation:** Using the `sgp4` library, all active satellites are propagated forward in time using standard mean-element math. 
  - **Time-Stepping:** The system steps through a time window (e.g., 24 hours) at discrete intervals (e.g., every 60 seconds).
  - **Spatial Indexing:** At every timestep, the Cartesian ECI (Earth-Centered Inertial) coordinates (x,y,z) of all satellites are loaded into a `scipy.spatial.cKDTree`. 
  - **Proximity Query:** The KD-Tree is queried for all pairs of objects that fall within a coarse `THRESHOLD_KM` (e.g., 50 km).
* **Output:** A list of candidate conjunction pairs (Object A, Object B, rough Time of Closest Approach [TCA], and rough distance).
* **Filtering:** Only the top $N$ closest pairs, or pairs that dip below a `TIGHT_THRESHOLD_KM` (e.g., 10 km), are passed to the next stage.

### Stage 3: High-Fidelity Refinement (`stage3_refine.py`)
SGP4 is fast but not accurate enough for close-approach analysis (its errors can exceed kilometers). This stage re-evaluates the screened candidates using rigorous physics.

* **Algorithmic Logic:**
  - **Parallel Processing:** Pairs are dispatched to multiple CPU cores using `ProcessPoolExecutor` to run computationally heavy differential equations concurrently.
  - **Co-Location Classifier:** Before heavy math, the distance history of pairs from Stage 1 is analyzed. If two objects remain constantly close (very low mean distance, near-zero standard deviation), they are classified as `COLOCATED` (e.g., docked spacecraft to the ISS) or `FORMATION` (e.g., TerraSAR-X tandem) and are safely ignored.
* **Physics & Force Model (ODE Integration):**
  Instead of SGP4, this stage uses `scipy.integrate.solve_ivp` with the `DOP853` solver (an 8th-order Runge-Kutta method) to numerically integrate the satellite's position and velocity over a tight window (± 5 minutes around the rough TCA).
  
  The mathematical force model ($F = ma$) includes:
  1. **Two-Body Gravity:** $\vec{a} = -\frac{\mu}{r^3}\vec{r}$
  2. **Zonal Harmonics (J2-J6):** Accounts for Earth's equatorial bulge and oblateness.
  3. **Lunisolar Perturbations:** Gravity from the Sun and Moon ($\vec{a}_{3rd}$).
  4. **Atmospheric Drag:** Uses the `NRLMSISE-00` empirical atmospheric model (or an exponential density fallback) to calculate drag: 
     $$ \vec{a}_{drag} = -\frac{1}{2} \rho \frac{C_D A}{m} ||\vec{v}|| \vec{v} $$
     *(Note: $C_D A / m$ is inferred from the TLE's $B^*$ parameter).*
* **Output:** Highly refined TCA, refined minimum distance, and exact position/velocity vectors ($\vec{r}_{tca}$, $\vec{v}_{tca}$) for both objects at TCA.

### Stage 4: Probability of Collision & Risk Assessment (`stage4_pc.py`, `risk.py`)
Knowing two objects will be 500 meters apart is useless without knowing the uncertainty of their positions. Stage 4 calculates the actual percentage chance of a physical strike.

#### A. Hard-Body Radius (HBR) Sizing
We must determine how physically large the objects are to define the "strike zone".
* **Logic:** Since TLEs don't contain physical size, the system uses a heuristic fallback model:
  - If a specific name is known (e.g., "Starlink", "ISS"), a custom HBR is applied (4m and 15m respectively).
  - Primary fallback: Radar Cross-Section (RCS). SMALL = 0.2m, MEDIUM = 0.8m, LARGE = 3.5m.
  - Secondary fallback: Object Type. DEBRIS = 0.5m, ROCKET BODY = 3.0m.
  - The final HBR used in math is $HBR_{combined} = HBR_1 + HBR_2$.

#### B. Empirical Covariance Model
Covariance ($\Sigma$) represents the 3D "bubble" of uncertainty around a satellite.
* **Logic:** The `compute_empirical_covariance_rtn` function synthesizes an error ellipsoid in the Radial, Transverse (In-track), and Normal (Cross-track) frame [RTN].
* **Formulas:** 
  The base uncertainty ($\sigma_R=100m, \sigma_T=1000m, \sigma_N=100m$) is scaled by three factors:
  1. **Altitude Scaling ($f_{alt}$):** Uncertainty spikes exponentially at low altitudes due to atmospheric drag unpredictability.
  2. **Epoch Age Scaling ($f_{age}$):** Uncertainty grows over time. Transverse error grows with $\Delta t^{1.5}$, while radial/normal grows with $\Delta t^{0.5}$.
  3. **Ballistic Drag Scaling ($f_{B^*}$):** Objects with higher $B^*$ (high area-to-mass ratio) drift more unpredictably.

#### C. Foster 2D Pc Integration (The Core Algorithm)
* **Algorithm:** Foster's 1992 approach to collision probability, heavily utilized by the US Space Force.
* **Logic & Math:**
  1. **Frame Transformation:** The RTN covariances are rotated into standard ECI coordinates, and the two covariance matrices are summed: $\Sigma_{combined} = \Sigma_{ECI,1} + \Sigma_{ECI,2}$.
  2. **B-Plane Projection:** A 2D "encounter plane" (B-plane) is constructed perpendicular to the relative velocity vector ($\vec{v}_{rel}$). The 3D relative position and combined 3D covariance are mathematically projected onto this 2D sheet.
  3. **Diagonalization:** The 2D covariance is diagonalized using eigenvalues to align the coordinate system with the principal axes of the uncertainty ellipse ($\sigma_x, \sigma_y$).
  4. **Integration:** The actual probability of collision is the integral of the 2D Gaussian probability density function (PDF) over a circle of radius $HBR_{combined}$ centered at the projected miss distance ($x_0, y_0$).
  $$ P_c = \frac{1}{2\pi \sigma_x \sigma_y} \iint_{HBR} \exp\left[-\frac{1}{2}\left(\left(\frac{x - x_0}{\sigma_x}\right)^2 + \left(\frac{y - y_0}{\sigma_y}\right)^2\right)\right] dx dy $$
  * **Numerical Method:** Because this integral has no closed-form solution, it is solved rapidly using **Gauss-Legendre Quadrature** (a form of numerical integration), transitioning from Cartesian $(x,y)$ to Polar $(r, \phi)$ coordinates for grid evaluation.

#### D. CDM Backtesting
* The pipeline includes a mechanism (`run_cdm_backtest`) to validate these complex formulas against real-world Conjunction Data Messages (CDMs) issued by the 18th Space Defense Squadron. It checks for order-of-magnitude correctness and risk-category concordance.

---

## 3. Summary of System Maturity
* **What is done:** You have successfully built a professional-grade astrodynamics pipeline. It successfully handles bulk screening (KD-Trees), filters out false positives (co-located structures), performs highly accurate numerical propagation (DOP853 + spherical harmonics + drag), and implements industry-standard Pc evaluation (Foster 2D Integration with empirical covariance scaling). 
* **Strengths:** The architectural separation of coarse SGP4 screening (fast) and fine DOP853 integration (slow, precise) ensures the system can run on consumer hardware while matching institutional physics models. The covariance scaling correctly mimics real-world orbital degradation.
