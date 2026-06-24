import cv2
import numpy as np


def make_dyed_film_clip(
    n_frames: int = 30,
    size: int = 200,
    break_at: int = 15,
    n_holes: int = 6,
    blur: float = 1.0,
) -> list[np.ndarray]:
    """Synthetic fluorescein clip: a bright fluorescing disc (green-ish under blue
    light) that develops growing dark break-up holes from frame `break_at` onward.
    `break_at >= n_frames` yields a stable clip with no break-up."""
    centre = (size // 2, size // 2)
    disc_r = size // 3
    rng_offsets = [(int(disc_r * 0.5 * np.cos(k)), int(disc_r * 0.5 * np.sin(k)))
                   for k in np.linspace(0, 2 * np.pi, n_holes, endpoint=False)]
    frames: list[np.ndarray] = []
    for i in range(n_frames):
        img = np.zeros((size, size, 3), dtype=np.uint8)
        # bright fluorescing disc (BGR: strong green + some blue/red so it's clearly bright)
        cv2.circle(img, centre, disc_r, (120, 220, 120), -1, cv2.LINE_AA)
        if i >= break_at:
            progress = (i - break_at + 1) / max(1, n_frames - break_at)
            hole_r = max(1, int(disc_r * 0.25 * progress))
            for ox, oy in rng_offsets:
                cv2.circle(img, (centre[0] + ox, centre[1] + oy), hole_r, (0, 0, 0), -1, cv2.LINE_AA)
        if blur > 0:
            img = cv2.GaussianBlur(img, (0, 0), blur)
        frames.append(img)
    return frames


def make_staining_image(n_spots: int = 0, size: int = 200, radius: int = 4) -> np.ndarray:
    """Synthetic corneal frame with `n_spots` bright punctate staining spots
    on a dim corneal disc."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    centre = (size // 2, size // 2)
    disc_r = size // 3
    cv2.circle(img, centre, disc_r, (40, 60, 40), -1, cv2.LINE_AA)
    for k in range(n_spots):
        ang = 2 * np.pi * k / max(1, n_spots)
        rad = disc_r * 0.6 * ((k % 3) + 1) / 3.0
        x = int(centre[0] + rad * np.cos(ang))
        y = int(centre[1] + rad * np.sin(ang))
        cv2.circle(img, (x, y), radius, (210, 245, 210), -1, cv2.LINE_AA)
    return img
