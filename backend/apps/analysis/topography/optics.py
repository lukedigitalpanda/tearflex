"""Paraxial convex-mirror (catadioptric) optics for Placido topography.

The cornea is a convex mirror of radius R (mm). A Placido ring of physical radius
h0 (mm) at object distance d0 (mm) forms a diminished, upright virtual image; a
camera of focal length f_px (pixels) at working distance d (mm) images it. Paraxial
Gaussian optics give a closed-form ring image radius and its exact inverse.

    r_px = f_px * h0 * R / (2*d0*d + R*d + R*d0)
    R    = 2*r_px*d0*d / (f_px*h0 - r_px*(d + d0))

This is the real image-formation physics (virtual image behind a convex mirror),
not a flat-object similar-triangles approximation. It is still paraxial: peripheral
/ aspheric reconstruction (subsystem B) needs per-ring ray tracing on top.
"""

KERATOMETRIC_INDEX = 1.3375
_POWER_NUMERATOR = (KERATOMETRIC_INDEX - 1.0) * 1000.0  # 337.5 D*mm


class ImplausibleReconstruction(ValueError):
    """The reconstruction produced (or implies) a physically-impossible cornea.

    Measurement failure — wrong intrinsics, bad extraction — not a caller bug:
    the caller should refuse the calibrated badge (downgrade), never publish
    the number or fail the scan. Raised here when individually-valid inputs
    are mutually non-physical, and by the reconstruction-level plausibility
    gate (see reconstruct._gate_plausibility, which re-exports this class).
    """


def _resolve_object_distance(distance_mm: float, object_distance_mm: float | None) -> float:
    return distance_mm if object_distance_mm is None else object_distance_mm


def ring_radius_px(corneal_radius_mm: float, distance_mm: float, focal_px: float,
                   object_radius_mm: float, object_distance_mm: float | None = None) -> float:
    d0 = _resolve_object_distance(distance_mm, object_distance_mm)
    if min(corneal_radius_mm, distance_mm, focal_px, object_radius_mm, d0) <= 0:
        raise ValueError("all optical inputs must be positive")
    R = corneal_radius_mm
    return focal_px * object_radius_mm * R / (2 * d0 * distance_mm + R * distance_mm + R * d0)


def corneal_radius_mm(ring_px: float, distance_mm: float, focal_px: float,
                      object_radius_mm: float, object_distance_mm: float | None = None) -> float:
    d0 = _resolve_object_distance(distance_mm, object_distance_mm)
    if min(ring_px, distance_mm, focal_px, object_radius_mm, d0) <= 0:
        raise ValueError("all optical inputs must be positive")
    denom = focal_px * object_radius_mm - ring_px * (distance_mm + d0)
    if denom <= 0:
        raise ImplausibleReconstruction("non-physical ring radius for this geometry (denominator <= 0)")
    return 2 * ring_px * d0 * distance_mm / denom


def radius_to_power(corneal_radius_mm: float) -> float:
    if corneal_radius_mm <= 0:
        raise ImplausibleReconstruction("corneal radius must be positive")
    return _POWER_NUMERATOR / corneal_radius_mm
