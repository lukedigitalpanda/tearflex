"""Physical geometry of the clip-on Placido cone.

The attachment is a truncated cone, narrow end (internal diameter) at the camera,
wide end (external diameter) toward the eye. Illuminated rings sit on the inner
conical surface, evenly spaced along the slant with an equal gap before the first
and after the last ring — so n_rings rings + (n_rings + 1) gaps = (2*n_rings + 1)
equal units.

Because the cone's surface is a straight slant, even spacing along it is even
spacing in *both* radius and axial depth, so the slant length cancels: each ring's
radius and depth are linear in its fractional position. Depth is measured from the
narrow/camera end (z = 0); the per-ring object distance for reconstruction is the
working distance minus the ring's depth.
"""

# Measured attachment geometry (approximate; a reference-sphere calibration will
# supersede these before absolute keratometry is trusted).
CONE_INTERNAL_DIAMETER_MM = 15.0   # narrow end, at the camera
CONE_EXTERNAL_DIAMETER_MM = 70.0   # wide end, toward the eye
CONE_HEIGHT_MM = 30.0              # axial depth narrow -> wide
CONE_N_RINGS = 10


def default_cone_profile(n_rings: int = CONE_N_RINGS,
                         internal_diameter_mm: float = CONE_INTERNAL_DIAMETER_MM,
                         external_diameter_mm: float = CONE_EXTERNAL_DIAMETER_MM,
                         height_mm: float = CONE_HEIGHT_MM) -> tuple[list[float], list[float]]:
    """Return (radii_mm, depths_mm) for the cone's rings, innermost-first.

    radii_mm[k] is the physical radius of ring k; depths_mm[k] is its axial depth
    from the narrow/camera end. Ring k is centred at fractional slant position
    t_k = (2k + 1.5) / (2*n_rings + 1) for k = 0..n_rings-1 (leading gap, then
    alternating ring/gap).
    """
    if n_rings < 1:
        raise ValueError("n_rings must be >= 1")
    r_inner = internal_diameter_mm / 2.0
    r_outer = external_diameter_mm / 2.0
    units = 2 * n_rings + 1
    radii, depths = [], []
    for k in range(n_rings):
        t = (2 * k + 1.5) / units
        radii.append(r_inner + (r_outer - r_inner) * t)
        depths.append(height_mm * t)
    return radii, depths
