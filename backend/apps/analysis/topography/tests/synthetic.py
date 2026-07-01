import cv2
import numpy as np
from apps.analysis.topography import optics as _optics


def make_ring_image(
    size: int = 512,
    n_rings: int = 8,
    ring_step: int = 22,
    center: tuple[int, int] | None = None,
    steep_axis_deg: float = 0.0,
    astigmatism: float = 0.0,
    blur: float = 1.5,
    thickness: int = 2,
) -> tuple[np.ndarray, dict]:
    """Synthetic Placido ring reflection (concentric ellipses).

    `astigmatism` (0..~0.4) compresses ring radii along `steep_axis_deg`
    (the steeper meridian), so 0 yields perfect circles. Returns
    (BGR uint8 image, ground_truth dict).
    """
    if center is None:
        center = (size // 2, size // 2)
    # Normalize once so the drawn ellipse and the recorded ground truth agree.
    axis_deg = steep_axis_deg % 180.0
    img = np.zeros((size, size, 3), dtype=np.uint8)
    for k in range(1, n_rings + 1):
        r = ring_step * k
        semi_steep = int(round(r * (1.0 - astigmatism / 2.0)))
        semi_flat = int(round(r * (1.0 + astigmatism / 2.0)))
        # cv2.ellipse axes = (half-length along `angle` direction, perpendicular).
        # Put the smaller (steep) axis along steep_axis_deg.
        cv2.ellipse(img, center, (semi_steep, semi_flat), axis_deg,
                    0, 360, (210, 210, 210), thickness, cv2.LINE_AA)
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    ground_truth = {
        'center': center,
        'n_rings': n_rings,
        'ring_step': ring_step,
        'steep_axis_deg': axis_deg,
        'astigmatism': astigmatism,
    }
    return img, ground_truth


def make_physical_ring_image(corneal_radius_mm, distance_mm, focal_px, object_radii_mm,
                             size=600, blur=1.5, thickness=2):
    """Concentric Placido rings rendered at the convex-mirror forward-model radii for a
    spherical cornea, so a correct reconstruction recovers `corneal_radius_mm`."""
    center = (size // 2, size // 2)
    img = np.zeros((size, size, 3), dtype=np.uint8)
    radii_px = [
        _optics.ring_radius_px(corneal_radius_mm, distance_mm, focal_px, h0)
        for h0 in object_radii_mm
    ]
    for r in radii_px:
        cv2.circle(img, center, int(round(r)), (210, 210, 210), thickness, cv2.LINE_AA)
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    ground_truth = {
        'center': center,
        'radii_px': radii_px,
        'expected_power': _optics.radius_to_power(corneal_radius_mm),
    }
    return img, ground_truth
