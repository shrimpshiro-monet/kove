from __future__ import annotations

import numpy as np


def blur_masked_region(
    frame: np.ndarray,
    mask: np.ndarray,
    strength: int = 25,
) -> np.ndarray:
    import cv2

    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8)
    if mask.ndim == 3:
        mask = mask[:, :, 0]

    kernel_size = strength * 2 + 1 if strength > 0 else 51
    ks = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
    blurred = cv2.GaussianBlur(frame, (ks, ks), strength)

    mask_3ch = np.stack([mask] * 3, axis=-1) if frame.ndim == 3 else mask
    out = frame.copy()
    out[mask_3ch > 0] = blurred[mask_3ch > 0]
    return out


def selective_color_adjust(
    frame: np.ndarray,
    mask: np.ndarray,
    brightness: float = 0.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    hue_shift: int = 0,
) -> np.ndarray:
    import cv2

    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8)
    if mask.ndim == 3:
        mask = mask[:, :, 0]

    mask_3ch = np.stack([mask] * 3, axis=-1)
    out = frame.copy()

    hsv = cv2.cvtColor(frame, cv2.COLOR_RGB2HSV).astype(np.int16)
    hsv[:, :, 2] = np.clip(((hsv[:, :, 2] - 128) * contrast + 128 + brightness).astype(np.int16), 0, 255)
    hsv[:, :, 1] = np.clip((hsv[:, :, 1] * saturation).astype(np.int16), 0, 255)
    if hue_shift != 0:
        hsv[:, :, 0] = (hsv[:, :, 0] + hue_shift) % 180
    adjusted = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    out[mask_3ch > 0] = adjusted[mask_3ch > 0]
    return out


def get_anchor_point(mask: np.ndarray) -> tuple[int, int]:
    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8)
    if mask.ndim == 3:
        mask = mask[:, :, 0]
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return (0, 0)
    cx = int(xs.mean())
    top_y = int(ys.min())
    return (cx, top_y)


def compose_overlay(
    frame: np.ndarray,
    overlay: np.ndarray,
    mask: np.ndarray,
    offset_x: int = 0,
    offset_y: int = 0,
    anchor: str = "top_center",
    opacity: float = 0.5,
) -> np.ndarray:
    import cv2

    anchor_x, anchor_y = get_anchor_point(mask)

    if anchor == "top_center":
        ox = anchor_x - overlay.shape[1] // 2 + offset_x
        oy = anchor_y - overlay.shape[0] + offset_y
    elif anchor == "centroid":
        ox = anchor_x - overlay.shape[1] // 2 + offset_x
        oy = anchor_y - overlay.shape[0] // 2 + offset_y
    elif anchor == "below":
        _, bottom_y = np.where(mask > 0)
        oy = int(bottom_y.max()) + offset_y if len(bottom_y) > 0 else anchor_y + offset_y
        ox = anchor_x - overlay.shape[1] // 2 + offset_x
    else:
        ox, oy = offset_x, offset_y

    out = frame.copy()
    oh, ow = overlay.shape[:2]
    fh, fw = frame.shape[:2]

    x0 = max(0, ox)
    y0 = max(0, oy)
    x1 = min(fw, ox + ow)
    y1 = min(fh, oy + oh)

    ox_src = x0 - ox
    oy_src = y0 - oy
    ox_end = ox_src + (x1 - x0)
    oy_end = oy_src + (y1 - y0)

    region = out[y0:y1, x0:x1]
    ov_region = overlay[oy_src:oy_end, ox_src:ox_end]

    if overlay.ndim == 3 and overlay.shape[2] == 4:
        alpha = ov_region[:, :, 3:4] / 255.0
        region[:] = (region * (1 - alpha) + ov_region[:, :, :3] * alpha).astype(np.uint8)
    else:
        if ov_region.shape != region.shape:
            ov_region = cv2.resize(ov_region, (region.shape[1], region.shape[0]))
        region[:] = cv2.addWeighted(region, 1 - opacity, ov_region, opacity, 0)

    return out


def draw_mask_overlay(
    frame: np.ndarray,
    mask: np.ndarray,
    subject_id: int,
    color: tuple[int, int, int] = (0, 255, 0),
    alpha: float = 0.4,
) -> np.ndarray:
    import cv2

    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8)
    if mask.ndim == 3:
        mask = mask[:, :, 0]

    overlay = frame.copy()
    color_mask = np.zeros_like(frame)
    color_mask[mask > 0] = color
    overlay = cv2.addWeighted(overlay, 1 - alpha, color_mask, alpha, 0)

    x, y = get_anchor_point(mask)
    cv2.putText(
        overlay,
        f"ID:{subject_id}",
        (x - 20, y - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        color,
        2,
    )
    return overlay
