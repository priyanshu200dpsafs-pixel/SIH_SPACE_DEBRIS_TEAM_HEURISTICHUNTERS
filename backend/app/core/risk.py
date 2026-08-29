"""
Stage 4: Probability of Collision (Pc) Calculation & Conjunction Risk Assessment.

Implements:
1. Empirical RTN Covariance Model (Osweiler/Peterson/Chan astrodynamics formulation)
   scaled by orbital altitude, TLE epoch age, and B* ballistic drag parameter.
2. Literature-standard Hybrid Hard-Body Radius (HBR) Sizing Model
   (RCS class primary with object-type fallback).
3. Foster & Akella-Alfriend 2D Collision Probability (Pc) Integration
   over the combined hard-body disk on the B-plane / encounter plane.
4. Historical CDM Backtest & Validation Harness for ground-truth accuracy checks.
"""

import os
import math
import json
import numpy as np
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional, List

# ── 1. HARD-BODY RADIUS SIZING MODEL ──────────────────────────────────────────
# Literature-standard sizing defaults based on Radar Cross-Section (RCS) class
# and catalog Object Type.
# ASSUMPTION: True physical bounding geometry is unmeasured in two-line element sets.
# We adopt conservative sphere radii (HBR) representing the effective collision cross-section.
HBR_RCS_MAP = {
    'SMALL': 0.20,    # RCS < 0.1 m^2 (CubeSats, small debris fragments)
    'MEDIUM': 0.80,   # 0.1 <= RCS <= 1.0 m^2 (microsatellites, medium debris)
    'LARGE': 3.50,    # RCS > 1.0 m^2 (large payloads, rocket bodies, Starlink)
}

HBR_OBJECT_TYPE_MAP = {
    'DEBRIS': 0.50,
    'ROCKET BODY': 3.00,
    'PAYLOAD': 3.00,
    'UNKNOWN': 1.00,
}

DEFAULT_HBR_FALLBACK = 1.00  # meters


def get_hard_body_radius(
    rcs_class: Optional[str] = None,
    object_type: Optional[str] = None,
    object_name: Optional[str] = None,
    default: float = DEFAULT_HBR_FALLBACK
) -> float:
    """
    Determine the effective hard-body radius (HBR) in meters for an orbital object.

    Resolution Strategy:
    1. Special constellation overrides (e.g. Starlink deployable array span ~4.0m)
    2. Primary: RCS classification ('SMALL', 'MEDIUM', 'LARGE')
    3. Secondary fallback: Catalog Object Type ('PAYLOAD', 'ROCKET BODY', 'DEBRIS')
    4. Tertiary default: 1.0 m

    Returns:
        Effective sphere radius in meters.
    """
    if object_name:
        name_upper = object_name.upper()
        if 'STARLINK' in name_upper:
            return 4.00  # Starlink V2 Mini / V1.5 large solar array footprint
        if 'SPACE STATION' in name_upper or 'ISS' in name_upper or 'TIANGONG' in name_upper:
            return 15.00 # Crewed space stations

    if rcs_class and isinstance(rcs_class, str):
        rcs_key = rcs_class.strip().upper()
        if rcs_key in HBR_RCS_MAP:
            return HBR_RCS_MAP[rcs_key]

    if object_type and isinstance(object_type, str):
        type_key = object_type.strip().upper()
        if type_key in HBR_OBJECT_TYPE_MAP:
            return HBR_OBJECT_TYPE_MAP[type_key]

    return default


# ── 2. EMPIRICAL RTN COVARIANCE MODEL ─────────────────────────────────────────
def compute_empirical_covariance_rtn(
    altitude_km: float,
    epoch_age_days: float = 0.0,
    bstar: float = 1e-4,
    base_sigma_r: float = 100.0,
    base_sigma_t: float = 1000.0,
    base_sigma_n: float = 100.0
) -> np.ndarray:
    """
    Compute the 3x3 diagonal position covariance matrix in the Radial-Transverse-Normal (RTN) frame.

    Physical Reasoning & Scaling Formulation:
    -----------------------------------------
    1. Base Standard Deviations (at nominal LEO ~700 km, fresh TLE epoch, typical B*):
       - sigma_R,0 = 100 m: Radial uncertainty is constrained by orbital energy / semi-major axis.
       - sigma_T,0 = 1000 m: In-track (along-track) uncertainty dominates by an order of magnitude
         due to mean anomaly drift and cumulative drag integration errors.
       - sigma_N,0 = 100 m: Cross-track (normal) uncertainty is bounded by the orbital plane inclination.

    2. Altitude Scaling Factor (f_alt):
       f_alt = exp(-(altitude_km - 500.0) / 600.0), clamped to [0.5, 4.0].
       Physical reasoning: In LEO (<600 km), atmospheric density increases exponentially with
       decreasing altitude. Dynamic thermospheric density variations (driven by solar EUV and
       geomagnetic activity) introduce severe unmodeled drag accelerations. Above 800 km, drag
       uncertainty falls off and geopotential/solar radiation pressure dominate.

    3. Epoch Age Scaling Factor (f_age):
       - Along-track: f_age_T = sqrt(1.0 + (1.5 * delta_t_days)^2)
       - Radial/Normal: f_age_R,N = sqrt(1.0 + (0.5 * delta_t_days)^2)
       Physical reasoning: Without active tracking updates, in-track error grows super-linearly
       due to along-track mean motion acceleration error (delta_M = 0.5 * n_dot * delta_t^2),
       while cross-track and radial errors grow much more slowly as periodic ephemeris oscillations.

    4. B* Ballistic Drag Scaling Factor (f_bstar):
       f_bstar = (1.0 + 5.0 * min(|B*|, 0.01) / 1e-4)^0.3, clamped to [0.8, 4.0].
       Physical reasoning: B* is directly proportional to the area-to-mass ratio (C_D * A / m).
       Objects with high area-to-mass ratios (lightweight debris, solar panels) experience
       amplified drag perturbations and faster ephemeris decay.

    Total Scaled 1-Sigma:
       sigma_R = sigma_R,0 * f_alt * f_age_R * (f_bstar ^ 0.3)
       sigma_T = sigma_T,0 * f_alt * f_age_T * (f_bstar ^ 1.0)
       sigma_N = sigma_N,0 * f_alt * f_age_N * (f_bstar ^ 0.2)

    Returns:
        3x3 numpy array representing Cov_RTN in meters^2.
    """
    # 1. Altitude scaling
    f_alt = math.exp(-(max(100.0, altitude_km) - 500.0) / 600.0)
    f_alt = max(0.5, min(4.0, f_alt))

    # 2. Epoch age scaling (delta_t in days)
    dt_days = max(0.0, float(epoch_age_days))
    f_age_t = math.sqrt(1.0 + (1.5 * dt_days) ** 2)
    f_age_r = math.sqrt(1.0 + (0.5 * dt_days) ** 2)
    f_age_n = math.sqrt(1.0 + (0.5 * dt_days) ** 2)

    # 3. B* drag scaling
    bstar_mag = abs(float(bstar)) if bstar is not None else 1e-4
    bstar_norm = min(bstar_mag, 0.01) / 1e-4
    f_bstar = (1.0 + 5.0 * bstar_norm) ** 0.3
    f_bstar = max(0.8, min(4.0, f_bstar))

    # Scaled sigmas in meters
    sigma_r = base_sigma_r * f_alt * f_age_r * (f_bstar ** 0.3)
    sigma_t = base_sigma_t * f_alt * f_age_t * f_bstar
    sigma_n = base_sigma_n * f_alt * f_age_n * (f_bstar ** 0.2)

    cov_rtn = np.diag([sigma_r ** 2, sigma_t ** 2, sigma_n ** 2])
    return cov_rtn


# ── 3. FRAME TRANSFORMATIONS ──────────────────────────────────────────────────
def rtn_to_eci_rotation_matrix(r_vec: np.ndarray, v_vec: np.ndarray) -> np.ndarray:
    """
    Construct the 3x3 orthonormal rotation matrix from the RTN frame to the ECI frame.
    Column 0: Radial unit vector   R = r / ||r||
    Column 1: Transverse unit vec  T = N x R
    Column 2: Normal unit vector   N = (r x v) / ||r x v||
    """
    r_norm = np.linalg.norm(r_vec)
    if r_norm < 1e-6:
        return np.eye(3)
    u_r = r_vec / r_norm

    h_vec = np.cross(r_vec, v_vec)
    h_norm = np.linalg.norm(h_vec)
    if h_norm < 1e-6:
        # Degenerate velocity: construct arbitrary orthogonal vector
        u_n = np.array([0.0, 0.0, 1.0])
        if abs(np.dot(u_r, u_n)) > 0.9:
            u_n = np.array([0.0, 1.0, 0.0])
        u_n = np.cross(u_r, u_n)
        u_n /= np.linalg.norm(u_n)
    else:
        u_n = h_vec / h_norm

    u_t = np.cross(u_n, u_r)
    u_t /= np.linalg.norm(u_t)

    # Matrix whose columns are [u_r, u_t, u_n]
    m_rtn_to_eci = np.column_stack((u_r, u_t, u_n))
    return m_rtn_to_eci


# ── 4. FOSTER / AKELLA-ALFRIEND 2D Pc CALCULATION ─────────────────────────────
def compute_foster_2d_pc(
    r1: np.ndarray,
    v1: np.ndarray,
    r2: np.ndarray,
    v2: np.ndarray,
    cov_rtn1: np.ndarray,
    cov_rtn2: np.ndarray,
    hbr: float,
    n_quad: int = 32
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute the 2D Probability of Collision (Pc) using the Foster/Akella-Alfriend method.

    Parameters:
        r1, v1: Position (km) and Velocity (km/s) of Primary object at TCA in ECI.
        r2, v2: Position (km) and Velocity (km/s) of Secondary object at TCA in ECI.
        cov_rtn1: 3x3 covariance matrix of Primary in RTN (meters^2).
        cov_rtn2: 3x3 covariance matrix of Secondary in RTN (meters^2).
        hbr: Combined Hard-Body Radius (R1 + R2) in meters.
        n_quad: Number of Gauss-Legendre quadrature nodes for numerical integration.

    Returns:
        (pc, diagnostics_dict)
    """
    # Convert positions and velocities to meters and m/s
    r1_m = r1 * 1000.0
    v1_m = v1 * 1000.0
    r2_m = r2 * 1000.0
    v2_m = v2 * 1000.0

    # Relative state
    rho_vec = r2_m - r1_m       # Miss vector at TCA (meters)
    v_rel = v2_m - v1_m         # Relative velocity vector (m/s)
    v_rel_norm = np.linalg.norm(v_rel)
    miss_distance = np.linalg.norm(rho_vec)

    if v_rel_norm < 1e-3:
        # Near-zero relative velocity (co-orbital / station-keeping)
        return 0.0, {'error': 'Zero relative velocity'}

    # 1. Transform RTN covariances to ECI
    m1 = rtn_to_eci_rotation_matrix(r1_m, v1_m)
    m2 = rtn_to_eci_rotation_matrix(r2_m, v2_m)
    cov_eci1 = m1 @ cov_rtn1 @ m1.T
    cov_eci2 = m2 @ cov_rtn2 @ m2.T

    # Combined position covariance in ECI (m^2)
    cov_eci = cov_eci1 + cov_eci2

    # 2. Construct Conjunction Plane (B-plane) reference frame
    # z_c: aligned with relative velocity unit vector
    u_z = v_rel / v_rel_norm

    # x_c: projection of miss vector perpendicular to relative velocity
    rho_proj = rho_vec - np.dot(rho_vec, u_z) * u_z
    rho_proj_norm = np.linalg.norm(rho_proj)
    if rho_proj_norm > 1e-4:
        u_x = rho_proj / rho_proj_norm
    else:
        # Miss vector is parallel to v_rel: choose arbitrary orthogonal vector
        u_x = np.cross(u_z, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(u_x) < 1e-4:
            u_x = np.cross(u_z, np.array([0.0, 1.0, 0.0]))
        u_x /= np.linalg.norm(u_x)

    # y_c: completes right-handed conjunction frame
    u_y = np.cross(u_z, u_x)
    u_y /= np.linalg.norm(u_y)

    # Transformation matrix from ECI to Conjunction Plane (2x3)
    t_plane = np.vstack((u_x, u_y))

    # 3. Project 3D ECI covariance onto 2D Conjunction Plane
    cov_2d = t_plane @ cov_eci @ t_plane.T  # 2x2 matrix

    # Miss vector coordinates in conjunction plane
    d_vec = t_plane @ rho_vec  # [x_0, y_0]

    # 4. Diagonalize 2D covariance matrix into principal axes
    eigvals, eigvecs = np.linalg.eigh(cov_2d)
    # Ensure positive variances
    sigma_x_sq = max(1.0, eigvals[0])
    sigma_y_sq = max(1.0, eigvals[1])
    sigma_x = math.sqrt(sigma_x_sq)
    sigma_y = math.sqrt(sigma_y_sq)

    # Transform miss vector into principal axes frame
    d_prime = eigvecs.T @ d_vec
    x0, y0 = d_prime[0], d_prime[1]

    # 5. Gauss-Legendre Quadrature 2D Polar Integration over disk of radius HBR
    r_pts, r_w = np.polynomial.legendre.leggauss(n_quad)
    phi_pts, phi_w = np.polynomial.legendre.leggauss(n_quad)

    # Map r from [-1, 1] to [0, HBR]
    r_scaled = 0.5 * hbr * (r_pts + 1.0)
    dr = 0.5 * hbr * r_w

    # Map phi from [-1, 1] to [0, 2*pi]
    phi_scaled = math.pi * (phi_pts + 1.0)
    dphi = math.pi * phi_w

    # 2D Grid
    cos_phi = np.cos(phi_scaled)
    sin_phi = np.sin(phi_scaled)

    R, PHI = np.meshgrid(r_scaled, phi_scaled, indexing='ij')
    COS_PHI, SIN_PHI = np.meshgrid(cos_phi, sin_phi, indexing='ij')

    X = R * COS_PHI - x0
    Y = R * SIN_PHI - y0

    # Native log-space integration using logsumexp
    from scipy.special import logsumexp as _logsumexp

    LOG_GAUSS = -0.5 * ((X / sigma_x) ** 2 + (Y / sigma_y) ** 2)
    LOG_INTEGRAND = np.log(R) + LOG_GAUSS

    log_dphi = np.log(dphi)
    log_inner = np.zeros(n_quad)
    for i in range(n_quad):
        log_inner[i] = _logsumexp(LOG_INTEGRAND[i, :] + log_dphi)

    log_dr = np.log(dr)
    log_integral = _logsumexp(log_inner + log_dr)

    log_pc = log_integral - math.log(2.0 * math.pi * sigma_x * sigma_y)
    
    try:
        pc = math.exp(log_pc) if log_pc < 0 else 1.0
    except OverflowError:
        pc = 0.0
    pc = max(0.0, min(1.0, float(pc)))

    # Compute asymptotic approx in log-space for comparison / logging
    log_pc_approx = math.log(hbr ** 2) - math.log(2.0 * sigma_x * sigma_y) + (-0.5 * ((x0 / sigma_x) ** 2 + (y0 / sigma_y) ** 2))
    try:
        pc_approx = math.exp(log_pc_approx)
    except OverflowError:
        pc_approx = 0.0

    log10_pc = log_pc / math.log(10.0)

    diagnostics = {
        'miss_distance_m': round(miss_distance, 4),
        'relative_speed_km_s': round(v_rel_norm / 1000.0, 4),
        'hbr_m': round(hbr, 3),
        'sigma_x_m': round(sigma_x, 2),
        'sigma_y_m': round(sigma_y, 2),
        'x0_m': round(x0, 2),
        'y0_m': round(y0, 2),
        'pc': pc,
        'log10_pc': log10_pc,
        'pc_approx': pc_approx,
        'pc_scientific': f"{pc:.6e}",
    }

    return pc, diagnostics

def compute_formal_risk_estimate(
    r1: np.ndarray,
    v1: np.ndarray,
    r2: np.ndarray,
    v2: np.ndarray,
    cov_rtn1: np.ndarray,
    cov_rtn2: np.ndarray,
    hbr: float,
    covariance_source: str = "Empirical TLE"
) -> Tuple[float, Dict[str, Any]]:
    """
    Formal Risk Estimation Layer.
    Calculates Pc using Foster and Chan, evaluates sensitivity to empirical covariance,
    and reports bounded estimates with uncertainty confidence.
    """
    # 1. Nominal Pc Calculation
    pc_nominal, diag = compute_foster_2d_pc(r1, v1, r2, v2, cov_rtn1, cov_rtn2, hbr)
    
    sigma_x_m = diag['sigma_x_m']
    sigma_y_m = diag['sigma_y_m']
    x0_m = diag['x0_m']
    y0_m = diag['y0_m']
    miss_m = diag['miss_distance_m']
    
    # Probability Dilution Defense
    # If the combined uncertainty is pathologically huge (>20km 1-sigma), 
    # the 2D Gaussian flattens out, falsely driving Pc -> 0.0 even for a dead-on collision.
    if sigma_x_m > 20000.0 or sigma_y_m > 20000.0:
        diag['pc'] = -1.0
        diag['pc_scientific'] = 'INVALID'
        diag['pc_lower'] = 0.0
        diag['pc_upper'] = 0.0
        diag['sensitivity_score'] = 100.0
        diag['uncertainty_confidence'] = "CRITICAL FAILURE"
        diag['foster_chan_agreement'] = 0.0
        diag['uncertainty_explanation'] = "INVALID_STALE_TLE: Covariance is pathologically dilated (>20km 1-sigma), leading to false safety via probability dilution."
        diag['covariance_source'] = covariance_source
        return -1.0, diag
    
    # 2. Chan Analytical Cross-Check
    log10_chan = calculate_pc_chan_log10(x0_m, y0_m, sigma_x_m, sigma_y_m, hbr)
    
    # Foster vs Chan Agreement (difference in log10 orders of magnitude)
    foster_chan_agreement = abs(diag['log10_pc'] - log10_chan) if diag['log10_pc'] > -300 and log10_chan > -300 else 0.0
    diag['foster_chan_agreement'] = round(foster_chan_agreement, 3)

    # 3. Sensitivity Analysis (Perturb covariance)
    # Factor 0.5 (Underestimated covariance)
    scale_down = 0.5
    log10_pc_lower = foster_2d_polar_fast_log10(miss_m, hbr, sigma_x_m * math.sqrt(scale_down), sigma_y_m * math.sqrt(scale_down))
    
    # Factor 2.0 (Overestimated covariance)
    scale_up = 2.0
    log10_pc_upper = foster_2d_polar_fast_log10(miss_m, hbr, sigma_x_m * math.sqrt(scale_up), sigma_y_m * math.sqrt(scale_up))
    
    # Notice: A smaller covariance could INCREASE Pc if the miss distance is small (probability mass concentrates), 
    # or DECREASE Pc if miss distance is large (probability mass pulls away from HBR).
    # Therefore, "upper" and "lower" bound naming refers to the mathematical min/max, not the scale factor.
    pc_bound_1 = 10 ** log10_pc_lower if log10_pc_lower > -300 else 0.0
    pc_bound_2 = 10 ** log10_pc_upper if log10_pc_upper > -300 else 0.0
    
    pc_lower = min(pc_bound_1, pc_bound_2)
    pc_upper = max(pc_bound_1, pc_bound_2)
    
    # Ensure nominal is generally between them, though numerical artifacts might push it slightly outside.
    pc_lower = min(pc_lower, pc_nominal)
    pc_upper = max(pc_upper, pc_nominal)
    
    sensitivity_score = log10_pc_upper - log10_pc_lower if (log10_pc_upper > -300 and log10_pc_lower > -300) else 0.0
    
    # 4. Uncertainty Confidence & Explanation
    uncertainty_confidence = "HIGH CONFIDENCE"
    explanation = "Operational covariance provided. High confidence in Pc estimate."
    
    if covariance_source == "Empirical TLE":
        if sensitivity_score > 2.0:
            uncertainty_confidence = "HIGH UNCERTAINTY"
            explanation = "Pc is highly sensitive (> 2 orders of magnitude variance) to assumed empirical drag/covariance errors. This is a generic TLE-derived estimate without formal operational covariance."
        elif sensitivity_score > 0.5:
            uncertainty_confidence = "MODERATE UNCERTAINTY"
            explanation = "Pc varies somewhat with assumed empirical covariance. Estimate is based on TLEs without formal operational covariance."
        else:
            uncertainty_confidence = "MODERATE CONFIDENCE"
            explanation = "Pc is stable across assumed covariance errors, but still relies on generic TLE-derived empirical covariance."
            
    # If the miss distance is extremely small and nominal Pc is high, 
    # even empirical covariance might be moderately confident it's a close approach.
    if pc_nominal > 1e-4 and miss_m < 100:
        if uncertainty_confidence == "HIGH UNCERTAINTY":
            uncertainty_confidence = "MODERATE UNCERTAINTY"
            explanation += " (Close miss distance provides some geometric confidence)."

    diag['pc_lower'] = pc_lower
    diag['pc_upper'] = pc_upper
    diag['sensitivity_score'] = round(sensitivity_score, 3)
    diag['uncertainty_confidence'] = uncertainty_confidence
    diag['uncertainty_explanation'] = explanation
    diag['covariance_source'] = covariance_source

    return pc_nominal, diag


# ── 5. FAST 2D POLAR QUADRATURE (LOG-SPACE FOR NUMERICAL STABILITY) ──────────
def foster_2d_polar_fast(
    miss_dist_m: float,
    hbr_m: float,
    sigma_x_m: float,
    sigma_y_m: float,
    miss_angle_rad: float = math.pi / 4.0,
    n_quad: int = 32
) -> float:
    """
    Fast Foster 2D polar integration given scalar encounter geometry.
    
    Works natively in LOG-SPACE to avoid floating-point underflow for
    distant encounters. Uses scipy.special.logsumexp for numerically
    stable accumulation of the quadrature integral.
    
    Returns the linear-space Pc (may be 0.0 if log_pc < -708).
    Use foster_2d_polar_fast_log() to get the log10(Pc) directly.
    """
    from scipy.special import logsumexp as _logsumexp

    x0 = miss_dist_m * math.cos(miss_angle_rad)
    y0 = miss_dist_m * math.sin(miss_angle_rad)

    r_pts, r_w = np.polynomial.legendre.leggauss(n_quad)
    phi_pts, phi_w = np.polynomial.legendre.leggauss(n_quad)

    r_scaled = 0.5 * hbr_m * (r_pts + 1.0)
    dr = 0.5 * hbr_m * r_w
    phi_scaled = math.pi * (phi_pts + 1.0)
    dphi = math.pi * phi_w

    cos_phi = np.cos(phi_scaled)
    sin_phi = np.sin(phi_scaled)

    R, _ = np.meshgrid(r_scaled, phi_scaled, indexing='ij')
    COS_PHI, SIN_PHI = np.meshgrid(cos_phi, sin_phi, indexing='ij')

    X = R * COS_PHI - x0
    Y = R * SIN_PHI - y0

    # Log of the Gaussian exponent (stays in log-space, no exp() call)
    LOG_GAUSS = -0.5 * ((X / sigma_x_m) ** 2 + (Y / sigma_y_m) ** 2)
    # Log of the integrand: log(r) + log_gauss
    # R is always > 0 for Gauss-Legendre interior nodes
    LOG_INTEGRAND = np.log(R) + LOG_GAUSS

    # Inner sum over phi: log( sum_j dphi_j * exp(log_integrand_ij) )
    # = logsumexp(log_integrand_ij + log(dphi_j))
    # dphi weights are always positive for Gauss-Legendre
    log_dphi = np.log(dphi)  # shape (n_quad,)
    log_inner = np.zeros(n_quad)
    for i in range(n_quad):
        log_inner[i] = _logsumexp(LOG_INTEGRAND[i, :] + log_dphi)

    # Outer sum over r: log( sum_i dr_i * exp(log_inner_i) )
    log_dr = np.log(dr)  # shape (n_quad,)
    log_integral = _logsumexp(log_inner + log_dr)

    # log(pc) = log_integral - log(2 * pi * sigma_x * sigma_y)
    log_pc = log_integral - math.log(2.0 * math.pi * sigma_x_m * sigma_y_m)

    # Convert to linear space, clamped to [0, 1]
    if log_pc > 0:
        return 1.0
    try:
        pc = math.exp(log_pc)
    except OverflowError:
        pc = 0.0
    return max(0.0, min(1.0, float(pc)))


def foster_2d_polar_fast_log10(
    miss_dist_m: float,
    hbr_m: float,
    sigma_x_m: float,
    sigma_y_m: float,
    miss_angle_rad: float = math.pi / 4.0,
    n_quad: int = 32
) -> float:
    """Return log10(Pc) computed natively in log-space. Preserves full dynamic range."""
    from scipy.special import logsumexp as _logsumexp

    x0 = miss_dist_m * math.cos(miss_angle_rad)
    y0 = miss_dist_m * math.sin(miss_angle_rad)

    r_pts, r_w = np.polynomial.legendre.leggauss(n_quad)
    phi_pts, phi_w = np.polynomial.legendre.leggauss(n_quad)

    r_scaled = 0.5 * hbr_m * (r_pts + 1.0)
    dr = 0.5 * hbr_m * r_w
    phi_scaled = math.pi * (phi_pts + 1.0)
    dphi = math.pi * phi_w

    cos_phi = np.cos(phi_scaled)
    sin_phi = np.sin(phi_scaled)

    R, _ = np.meshgrid(r_scaled, phi_scaled, indexing='ij')
    COS_PHI, SIN_PHI = np.meshgrid(cos_phi, sin_phi, indexing='ij')

    X = R * COS_PHI - x0
    Y = R * SIN_PHI - y0

    LOG_GAUSS = -0.5 * ((X / sigma_x_m) ** 2 + (Y / sigma_y_m) ** 2)
    LOG_INTEGRAND = np.log(R) + LOG_GAUSS

    log_dphi = np.log(dphi)
    log_inner = np.zeros(n_quad)
    for i in range(n_quad):
        log_inner[i] = _logsumexp(LOG_INTEGRAND[i, :] + log_dphi)

    log_dr = np.log(dr)
    log_integral = _logsumexp(log_inner + log_dr)

    log_pc_ln = log_integral - math.log(2.0 * math.pi * sigma_x_m * sigma_y_m)
    # Convert natural log to log10
    return float(log_pc_ln / math.log(10.0))


# ── 6. CHAN 1997 ANALYTICAL Pc APPROXIMATION (LOG-SPACE) ──────────────────────
def calculate_pc_chan(x0: float, y0: float, sigma_x: float, sigma_y: float, hbr: float) -> float:
    """
    Calculate Probability of Collision (Pc) using Chan's analytical approximation.
    
    Works natively in LOG-SPACE:
      log(Pc) = -v_c/2 + log(1 - exp(-u_c/2))
    
    Uses math.expm1 for numerical stability of the (1 - exp(-x)) term.
    Returns linear-space Pc. Use calculate_pc_chan_log10() for log10(Pc).
    """
    if sigma_x <= 0 or sigma_y <= 0:
        return 0.0
        
    v_c = (x0 / sigma_x)**2 + (y0 / sigma_y)**2
    u_c = (hbr**2) / (sigma_x * sigma_y)
    
    # log(Pc) = -v_c/2 + log(1 - exp(-u_c/2))
    # = -v_c/2 + log(-expm1(-u_c/2))
    # expm1(-x) = exp(-x) - 1, so -expm1(-x) = 1 - exp(-x) > 0
    log_pc = -0.5 * v_c + math.log(-math.expm1(-0.5 * u_c))
    
    try:
        pc = math.exp(log_pc)
    except OverflowError:
        pc = 0.0
    return max(0.0, min(1.0, float(pc)))


def calculate_pc_chan_log10(x0: float, y0: float, sigma_x: float, sigma_y: float, hbr: float) -> float:
    """Return log10(Pc) computed natively in log-space. Preserves full dynamic range."""
    if sigma_x <= 0 or sigma_y <= 0:
        return float('-inf')
        
    v_c = (x0 / sigma_x)**2 + (y0 / sigma_y)**2
    u_c = (hbr**2) / (sigma_x * sigma_y)
    
    log_pc_ln = -0.5 * v_c + math.log(-math.expm1(-0.5 * u_c))
    return float(log_pc_ln / math.log(10.0))


# ── 7. BACKTEST HARNESS AGAINST HISTORICAL CDMs ─────────────────────────────
def run_cdm_backtest(cdm_file_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Run backtest validation comparing our physics-based Foster 2D Pc calculations
    against ground-truth reported PC values in historical_cdms.json.

    Returns comprehensive metrics:
      - Pearson & Spearman correlations (linear & log-space)
      - Mean Absolute Error in log10(Pc)
      - Risk category concordance matrix (High Risk >= 1e-4, Low Risk < 1e-6)
    """
    if not cdm_file_path:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        cdm_file_path = os.path.normpath(
            os.path.join(base_dir, '..', 'data', 'cdm_training', 'historical_cdms.json')
        )

    with open(cdm_file_path, 'r') as f:
        cdm_data = json.load(f)

    valid_records = [r for r in cdm_data if r.get('PC') is not None]
    n_total = len(valid_records)

    pcs_true = []
    pcs_model = []
    log10_model_list = []
    miss_list = []
    hbr_list = []

    for rec in valid_records:
        pc_true = float(rec['PC'])
        miss_m = float(rec['MIN_RNG'])

        # Sizing model
        r1 = get_hard_body_radius(rec.get('SAT1_RCS'), rec.get('SAT1_OBJECT_TYPE'), rec.get('SAT_1_NAME'))
        r2 = get_hard_body_radius(rec.get('SAT2_RCS'), rec.get('SAT2_OBJECT_TYPE'), rec.get('SAT_2_NAME'))
        hbr = r1 + r2

        # Lead time / epoch delta-t
        dt_created = datetime.fromisoformat(rec['CREATED'].replace(' ', 'T'))
        dt_tca = datetime.fromisoformat(rec['TCA'])
        lead_days = max(0.0, (dt_tca - dt_created).total_seconds() / 86400.0)

        # Empirical covariance for CDM backtest:
        # Space-Track CDMs reflect special perturbations tracking with median encounter sigma ~140m.
        # Scaled by lead time and altitude proxy:
        cov1 = compute_empirical_covariance_rtn(altitude_km=600.0, epoch_age_days=lead_days, base_sigma_r=80.0, base_sigma_t=250.0, base_sigma_n=80.0)
        cov2 = compute_empirical_covariance_rtn(altitude_km=600.0, epoch_age_days=lead_days, base_sigma_r=80.0, base_sigma_t=250.0, base_sigma_n=80.0)

        # 2D projection semi-axes on conjunction plane
        sig_x = math.sqrt(cov1[0, 0] + cov2[0, 0])
        sig_y = math.sqrt(0.5 * (cov1[1, 1] + cov2[1, 1]) + cov1[2, 2] + cov2[2, 2])

        pc_calc = foster_2d_polar_fast(miss_m, hbr, sig_x, sig_y)
        log10_pc_calc = foster_2d_polar_fast_log10(miss_m, hbr, sig_x, sig_y)

        pcs_true.append(pc_true)
        pcs_model.append(pc_calc)
        log10_model_list.append(log10_pc_calc)
        miss_list.append(miss_m)
        hbr_list.append(hbr)

    pcs_true = np.array(pcs_true)
    pcs_model = np.array(pcs_model)
    log10_model = np.array(log10_model_list)

    log_true = np.log10(pcs_true)

    # Statistical metrics
    corr_linear = float(np.corrcoef(pcs_model, pcs_true)[0, 1])
    corr_log = float(np.corrcoef(log10_model, log_true)[0, 1])
    mae_log = float(np.mean(np.abs(log10_model - log_true)))

    # Risk categorization (Standard Space Flight Operations thresholds)
    # High Risk: Pc >= 1e-4 (Maneuver consideration threshold)
    # Medium Risk: 1e-6 <= Pc < 1e-4
    # Low Risk: Pc < 1e-6
    high_true = pcs_true >= 1e-4
    high_model = pcs_model >= 1e-4
    both_high = np.sum(high_true & high_model)

    low_true = pcs_true < 1e-6
    low_model = pcs_model < 1e-6
    both_low = np.sum(low_true & low_model)

    high_concordance = float(both_high / np.sum(high_true)) if np.sum(high_true) > 0 else 0.0

    return {
        'total_evaluated': n_total,
        'correlation_linear': round(corr_linear, 4),
        'correlation_log_space': round(corr_log, 4),
        'mean_absolute_log_error': round(mae_log, 4),
        'high_risk_ground_truth_count': int(np.sum(high_true)),
        'high_risk_model_predicted_count': int(np.sum(high_model)),
        'high_risk_concordance_pct': round(high_concordance * 100.0, 2),
        'both_high_risk_count': int(both_high),
    }


if __name__ == '__main__':
    print("=" * 70)
    print(" STAGE 4: PROBABILITY OF COLLISION & RISK MODULE TEST")
    print("=" * 70)
    bt = run_cdm_backtest()
    print("Backtest Validation Results against historical_cdms.json:")
    for k, v in bt.items():
        print(f"  {k}: {v}")

# ── 8. MONTE CARLO Pc VALIDATION (INDEPENDENT VERIFICATION) ─────────────────
def run_monte_carlo_validation(
    miss_dist_m: float,
    hbr_m: float,
    sigma_x_m: float,
    sigma_y_m: float,
    foster_pc: float,
    miss_angle_rad: float = math.pi / 4.0,
    num_samples: int = 100000,
    seed: int = 42
) -> Dict[str, Any]:
    """
    Independent Monte Carlo validation of analytical Pc.
    Constructs the 2D relative state uncertainty on the B-plane and evaluates HBR intersection.
    """
    import time
    start_time = time.perf_counter()
    
    np.random.seed(seed)
    
    x0 = miss_dist_m * math.cos(miss_angle_rad)
    y0 = miss_dist_m * math.sin(miss_angle_rad)
    
    # Generate 2D Gaussian samples
    samples_x = np.random.normal(x0, sigma_x_m, num_samples)
    samples_y = np.random.normal(y0, sigma_y_m, num_samples)
    
    # Calculate distance to origin (0,0) for each sample
    dist_sq = samples_x**2 + samples_y**2
    hbr_sq = hbr_m**2
    
    # Count collisions
    collisions = np.sum(dist_sq <= hbr_sq)
    
    mc_pc = float(collisions) / num_samples
    
    # Confidence Interval (95%) using normal approximation
    # If collisions is 0, we can use the rule of 3 for upper bound (3 / N)
    if collisions == 0:
        ci_str = f"[0.0, {3.0 / num_samples:.2e}]"
    else:
        margin = 1.96 * math.sqrt((mc_pc * (1.0 - mc_pc)) / num_samples)
        ci_lower = max(0.0, mc_pc - margin)
        ci_upper = min(1.0, mc_pc + margin)
        ci_str = f"[{ci_lower:.2e}, {ci_upper:.2e}]"
    
    # Evaluate agreement
    if mc_pc == 0.0 and foster_pc < (1.0 / num_samples):
        # Both predict essentially zero at this sample resolution
        status = "AGREE"
    elif mc_pc == 0.0:
        # MC is 0 but foster is high enough that we should have seen it
        status = "SIGNIFICANT DIVERGENCE"
    elif foster_pc == 0.0:
        status = "SIGNIFICANT DIVERGENCE"
    else:
        log_mc = math.log10(mc_pc)
        log_foster = math.log10(foster_pc)
        diff = abs(log_mc - log_foster)
        
        if diff <= 0.5:
            status = "AGREE"
        elif diff <= 1.0:
            status = "MINOR DIVERGENCE"
        else:
            status = "SIGNIFICANT DIVERGENCE"
            
    elapsed = time.perf_counter() - start_time
    
    return {
        'mc_pc': mc_pc,
        'mc_confidence_interval': ci_str,
        'mc_sample_count': num_samples,
        'mc_validation_status': status,
        'mc_seed': seed,
        'mc_runtime_ms': round(elapsed * 1000.0, 2)
    }
