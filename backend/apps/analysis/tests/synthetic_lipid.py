import cv2
import numpy as np

# Saturated BGR band colours for the "coloured fringes" pattern (wide hue spread).
_FRINGE_COLOURS = [(0, 0, 230), (0, 230, 230), (0, 230, 0), (230, 230, 0), (230, 0, 0), (230, 0, 230)]


def make_lipid_pattern(kind: str = 'amorphous', size: int = 200, blur: float = 0.0) -> np.ndarray:
    """Synthetic lipid interference pattern, masked to a central disc.
    'meshwork' = fine reticular grey lines (high texture, low colour);
    'amorphous' = smooth grey disc (low texture, low colour);
    'fringes' = saturated coloured concentric bands (high colour)."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cx, cy, r = size // 2, size // 2, size // 3
    cv2.circle(img, (cx, cy), r, (160, 160, 160), -1, cv2.LINE_AA)   # base grey reflection
    if kind == 'meshwork':
        for k in range(0, size, 7):
            cv2.line(img, (k, 0), (k, size), (110, 110, 110), 1, cv2.LINE_AA)
            cv2.line(img, (0, k), (size, k), (110, 110, 110), 1, cv2.LINE_AA)
    elif kind == 'fringes':
        for k in range(1, len(_FRINGE_COLOURS) + 1):
            cv2.circle(img, (cx, cy), int(r * k / (len(_FRINGE_COLOURS) + 1)),
                       _FRINGE_COLOURS[k - 1], 5, cv2.LINE_AA)
    # 'amorphous' leaves the smooth disc as-is.
    mask = np.zeros((size, size), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), r, 255, -1)
    img[mask == 0] = 0
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    return img
