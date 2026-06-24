"""Working-distance estimators + fusion for the calibration foundation.

Each lever is an independent estimator of the camera-to-eye distance, returning a
`DistanceEstimate` (value + 1-sigma uncertainty). `fuse_distances` combines any set of
them by **inverse-variance (precision) weighting** — the maximum-likelihood combination
of independent measurements, so the fused estimate is more precise than any single one.

This module is the distance *machinery*: the maths is standard and unit-tested here. The
per-lever relative-error constants below are **placeholders from published figures** and
must be re-tuned against real captures before the absolute accuracy is trusted (see the
subsystem-A design spec's honesty boundary).

Fixed-distance case: if the clip turns out to fix the working distance, pass it as an
estimate with `sigma_mm ~= 0` (a known constant) — the fusion then trusts it fully.
"""
import math
from dataclasses import dataclass

# Published / placeholder 1-sigma RELATIVE errors — re-tune against real captures.
IRIS_REL_ERROR = 0.043   # MediaPipe Iris: ~4.3% mean distance error (population-average iris)
FOCUS_REL_ERROR = 0.05   # camera-reported focus distance — placeholder, device-dependent

DEFAULT_IRIS_MM = 11.7   # population-average horizontal visible iris diameter (±0.5 mm)


@dataclass
class DistanceEstimate:
    """A camera-to-eye distance estimate (mm) with its 1-sigma uncertainty (mm).

    `spread_mm` is only meaningful on a fused result: the max-min disagreement across the
    inputs — a sanity signal ("how far apart did the levers land?").
    """
    source: str
    distance_mm: float
    sigma_mm: float
    spread_mm: float = 0.0


def distance_from_iris(iris_px: float, focal_px: float,
                       iris_mm: float = DEFAULT_IRIS_MM,
                       rel_error: float = IRIS_REL_ERROR) -> DistanceEstimate:
    """Distance from the iris/limbus as a known-size scale reference (similar triangles).

    real_size / distance = pixel_size / focal_length  =>  distance = focal_px * iris_mm / iris_px.
    """
    if iris_px <= 0 or focal_px <= 0 or iris_mm <= 0:
        raise ValueError("iris_px, focal_px and iris_mm must be positive")
    distance_mm = focal_px * iris_mm / iris_px
    return DistanceEstimate('iris', distance_mm, sigma_mm=rel_error * distance_mm)


def distance_from_focus(focus_diopters: float,
                        rel_error: float = FOCUS_REL_ERROR) -> DistanceEstimate:
    """Distance from the camera's reported focus.

    Android Camera2 `LENS_FOCUS_DISTANCE` is in diopters (1 / metres) when calibrated, so
    distance_m = 1 / diopters. (iOS reports an abstract lens position that needs a per-device
    lens-position -> distance map first; convert to diopters before calling this.)
    """
    if focus_diopters <= 0:
        raise ValueError("focus_diopters must be positive (0 = focused at infinity)")
    distance_mm = 1000.0 / focus_diopters
    return DistanceEstimate('focus', distance_mm, sigma_mm=rel_error * distance_mm)


def fuse_distances(estimates: list[DistanceEstimate]) -> DistanceEstimate:
    """Combine independent distance estimates by inverse-variance (precision) weighting.

    fused = Σ(w_i · d_i) / Σ w_i,  w_i = 1 / σ_i² ,  fused σ = sqrt(1 / Σ w_i).
    The fused σ is smaller than any input σ — combining beats either lever alone. If any
    estimate is exact (σ <= 0, e.g. a fixed/known distance), it dominates.
    """
    if not estimates:
        raise ValueError("no distance estimates to fuse")
    distances = [e.distance_mm for e in estimates]
    spread = max(distances) - min(distances)

    if len(estimates) == 1:
        e = estimates[0]
        return DistanceEstimate('fused', e.distance_mm, e.sigma_mm, spread_mm=0.0)

    exact = [e for e in estimates if e.sigma_mm <= 0]
    if exact:
        # A known/fixed distance (e.g. a fixed-standoff clip) overrides the noisy levers.
        return DistanceEstimate('fused', exact[0].distance_mm, 0.0, spread_mm=spread)

    weights = [1.0 / (e.sigma_mm ** 2) for e in estimates]
    wsum = sum(weights)
    fused = sum(w * e.distance_mm for w, e in zip(weights, estimates)) / wsum
    fused_sigma = math.sqrt(1.0 / wsum)
    return DistanceEstimate('fused', fused, fused_sigma, spread_mm=spread)
