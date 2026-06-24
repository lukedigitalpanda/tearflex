import cv2
import numpy as np

CENTER_INTENSITY_PERCENTILE = 92.0
PEAK_MIN_RELATIVE_HEIGHT = 0.35
MIN_PEAK_SPACING_PX = 8  # rings are ~24px apart; closer "peaks" belong to the same ring


def find_reflection_center(gray: np.ndarray) -> tuple[float, float]:
    """Intensity-weighted centroid of the brightest pixels (the ring pattern)."""
    h, w = gray.shape
    thresh = np.percentile(gray, CENTER_INTENSITY_PERCENTILE)
    mask = gray >= thresh
    if not mask.any():
        return (w / 2.0, h / 2.0)
    ys, xs = np.nonzero(mask)
    weights = gray[ys, xs].astype(np.float64)
    return (float(np.average(xs, weights=weights)), float(np.average(ys, weights=weights)))


def _find_peaks(profile: np.ndarray, min_rel_height: float = PEAK_MIN_RELATIVE_HEIGHT) -> list[float]:
    """Sub-pixel indices of local maxima above a relative-height threshold."""
    if profile.size < 3:
        return []
    span = float(profile.max() - profile.min())
    if span <= 1e-6:
        return []
    thr = profile.min() + min_rel_height * span
    peaks: list[float] = []
    for i in range(1, profile.size - 1):
        if profile[i] >= thr and profile[i] >= profile[i - 1] and profile[i] > profile[i + 1]:
            denom = profile[i - 1] - 2 * profile[i] + profile[i + 1]
            delta = 0.5 * (profile[i - 1] - profile[i + 1]) / denom if denom != 0 else 0.0
            peaks.append(i + float(np.clip(delta, -1.0, 1.0)))
    # Drop trailing-plateau false positives: two equal samples before a falling edge
    # register as a second peak that would displace an outer ring out of srt[:n_rings].
    if len(peaks) > 1:
        deduped = [peaks[0]]
        for p in peaks[1:]:
            if p - deduped[-1] >= MIN_PEAK_SPACING_PX:
                deduped.append(p)
        peaks = deduped
    return peaks


def extract_rings(gray: np.ndarray, center: tuple[float, float],
                  n_angles: int = 180, max_rings: int = 10) -> dict:
    """Sample radial intensity profiles around `center` and locate ring crossings."""
    cx, cy = center
    h, w = gray.shape
    max_r = int(min(cx, cy, w - cx, h - cy)) - 2
    if max_r < 5:
        raise ValueError("Reflection centre too close to image edge for ring extraction")

    polar = cv2.warpPolar(
        gray.astype(np.float32), (max_r, n_angles), (cx, cy), max_r,
        cv2.WARP_POLAR_LINEAR + cv2.WARP_FILL_OUTLIERS,
    )  # shape (n_angles, max_r): row = angle, col = radius

    per_spoke = [_find_peaks(polar[i])[:max_rings] for i in range(n_angles)]
    positive_counts = [len(p) for p in per_spoke if p]
    n_rings = max(1, min(positive_counts)) if positive_counts else 1
    n_rings = min(n_rings, max_rings)

    radii = np.full((n_angles, n_rings), np.nan, dtype=np.float64)
    complete = 0
    for i, peaks in enumerate(per_spoke):
        srt = sorted(peaks)
        if len(srt) >= n_rings:
            radii[i] = srt[:n_rings]
            complete += 1
        elif srt:
            radii[i, :len(srt)] = srt
            radii[i, len(srt):] = srt[-1]

    col_means = np.nanmean(radii, axis=0)
    nan_idx = np.where(np.isnan(radii))
    radii[nan_idx] = np.take(col_means, nan_idx[1])

    return {
        'center': (float(cx), float(cy)),
        'angles_deg': np.arange(n_angles) * (360.0 / n_angles),
        'radii': radii,
        'n_rings': int(n_rings),
        'completeness': float(complete / n_angles),
    }
