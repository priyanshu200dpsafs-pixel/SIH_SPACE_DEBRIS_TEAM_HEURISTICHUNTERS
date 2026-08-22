import math
from app.db.models import Conjunction
from app.schemas.conjunctions import CollisionProbabilityMetrics
from app.core.risk import (
    foster_2d_polar_fast, foster_2d_polar_fast_log10,
    calculate_pc_chan, calculate_pc_chan_log10
)

# Threshold below which linear Pc underflows to meaningless values.
# log10(Pc) < -15 means Pc < 1e-15 — return None for linear, keep log10.
LOG10_NEGLIGIBLE_THRESHOLD = -15.0


def _pc_display(log10_val: float, linear_val: float) -> str:
    """Generate a human-readable display string for a Pc value."""
    if log10_val < LOG10_NEGLIGIBLE_THRESHOLD:
        return f"< 1e-15 (negligible; log10 = {log10_val:.1f})"
    return f"{linear_val:.3e}"


def _safe_linear(log10_val: float) -> float | None:
    """Convert log10(Pc) to linear, returning None if below threshold."""
    if log10_val < LOG10_NEGLIGIBLE_THRESHOLD:
        return None
    ln_val = log10_val * math.log(10.0)
    try:
        return max(0.0, min(1.0, math.exp(ln_val)))
    except OverflowError:
        return None


def compute_conjunction_metrics(conj: Conjunction) -> CollisionProbabilityMetrics:
    """
    Compute Foster '92 and Chan '97 Pc metrics for a conjunction.
    
    Works in log-space throughout. The linear Pc fields are set to None
    when log10(Pc) < -15, since math.exp() would underflow to 0.0 which
    falsely reads as "impossible" rather than "extremely unlikely."
    """
    miss_dist_m = conj.min_dist_km * 1000.0
    hbr_m = conj.hbr_m
    sigma_x, sigma_y = 150.0, 150.0  # Nominal standard deviation in meters
    x0 = miss_dist_m * math.cos(math.pi / 4.0)
    y0 = miss_dist_m * math.sin(math.pi / 4.0)

    # Compute in log10 space (always numerically stable)
    foster_log10 = foster_2d_polar_fast_log10(miss_dist_m, hbr_m, sigma_x, sigma_y)
    chan_log10 = calculate_pc_chan_log10(x0, y0, sigma_x, sigma_y, hbr_m)

    # Convert to linear only when above the negligible threshold
    foster_pc = _safe_linear(foster_log10)
    chan_pc = _safe_linear(chan_log10)

    # Display strings
    foster_display = _pc_display(foster_log10, foster_pc if foster_pc is not None else 0.0)
    chan_display = _pc_display(chan_log10, chan_pc if chan_pc is not None else 0.0)

    # Divergence: always computed in log-space to avoid 0/0
    if foster_log10 > -300 and chan_log10 > -300:
        # Use log-space difference: |log10(foster) - log10(chan)| as a fraction of foster
        if foster_log10 != 0:
            divergence = abs(foster_log10 - chan_log10) / abs(foster_log10) * 100.0
        else:
            divergence = 0.0
    else:
        divergence = 0.0

    consensus_verified = divergence <= 10.0
    manual_review = not consensus_verified

    return CollisionProbabilityMetrics(
        foster_2d=foster_pc,
        foster_2d_log10=foster_log10,
        foster_2d_display=foster_display,
        chan_analytical=chan_pc,
        chan_analytical_log10=chan_log10,
        chan_analytical_display=chan_display,
        divergence_percentage=divergence,
        algorithm_consensus_verified=consensus_verified,
        requires_manual_review=manual_review
    )
