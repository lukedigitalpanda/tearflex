import cv2
import numpy as np


def sharpness(gray: np.ndarray) -> float:
    """Variance of the Laplacian — higher means crisper focus."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def select_best_frame(images: list[np.ndarray]) -> int:
    """Index of the sharpest image among BGR frames."""
    if not images:
        raise ValueError("No images to select from")
    scores = [sharpness(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)) for im in images]
    return int(np.argmax(scores))
