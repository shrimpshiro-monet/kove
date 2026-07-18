"""
Text Overlay Detector

Three-pass approach:
1. pytesseract OCR for actual text recognition (content, position, confidence)
2. Heuristic analysis for font properties (color, size, weight, shadow)
3. Temporal deduplication across frames

Outputs per-segment text overlays with actual readable content.
"""

import json
import os
import subprocess
import tempfile

# Fix SSL for easyocr (PyTorch model downloads)
os.environ.setdefault("SSL_CERT_FILE", __import__("certifi").where())
from collections import Counter
from typing import Any, Optional

import cv2
import numpy as np
from PIL import Image
import pytesseract

TEXT_CONFIDENCE_THRESHOLD = 50

# Lazy EasyOCR reader singleton (initialised once)
_ocr_reader = None


def _get_easyocr():
    global _ocr_reader
    if _ocr_reader is not None:
        return _ocr_reader
    try:
        import os as _os
        import certifi
        _os.environ["SSL_CERT_FILE"] = certifi.where()
        import easyocr
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    except Exception:
        _ocr_reader = False
    return _ocr_reader


def detect_text(video_path: str, shots: list, use_easyocr: bool = False) -> list[dict]:
    """Detect and read text overlays for each shot using pytesseract OCR."""
    print(f"  Detecting text overlays (pytesseract{' + EasyOCR' if use_easyocr else ''})...")

    text_per_shot = []

    for i, shot in enumerate(shots):
        frames = _extract_frames(video_path, shot["start"], shot["end"])
        shot_text = _analyze_shot_text(frames, shot, use_easyocr=use_easyocr)
        shot_text["shotIndex"] = shot["index"]
        shot_text["time"] = shot["start"]
        text_per_shot.append(shot_text)

        for f in frames:
            if os.path.exists(f):
                os.remove(f)

    return text_per_shot


def _extract_frames(video_path: str, start: float, end: float) -> list[str]:
    """Extract frames from a segment for OCR. Max 3 frames for speed."""
    tmpdir = tempfile.mkdtemp(prefix="text-")
    frames = []
    n = min(3, max(1, int((end - start) * 2)))
    for i in range(n):
        t = start + (end - start) * i / (n - 1) if n > 1 else (start + end) / 2
        t = max(0, t)
        path = os.path.join(tmpdir, f"frame_{i}.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-i", video_path,
             "-vframes", "1", "-q:v", "2", path],
            capture_output=True, timeout=10,
        )
        frames.append(path)
    return frames


def _preprocess_for_ocr(img: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Preprocess image for better OCR: CLAHE contrast enhancement.
    Returns (grayscale, enhanced) images. No OTSU thresholding — that
    destroys text on multi-colored backgrounds (flags, gradients, etc.)."""
    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(cv_img)
    return Image.fromarray(cv_img), Image.fromarray(enhanced)


_PLATFORM_WATERMARKS = {
    "tiktok", "instagram", "youtube", "twitter", "snapchat",
    "facebook", "reels", "shorts", "stories",
}

_EDITOR_PENALTY_KW = {
    "foul", "to:", "timeout", "quarter", "q1", "q2", "q3", "q4",
    "score", "st", "nd", "rd", "th",
}


def _score_editor_text(text: str, fontSize: str, placement: str, confidence: float,
                       bbox: tuple = (0, 0, 0, 0), frame_size: tuple = (1, 1)) -> float:
    """Score a text item by how likely it is to be an editor-added text overlay
    vs platform watermark, broadcast overlay, or noise."""
    import re
    score = confidence
    lower = text.lower().strip()

    # ── Platform watermark filter (instant kill) ──
    if lower in _PLATFORM_WATERMARKS:
        return 0.0

    # ── Timestamp pattern filter (00:01:26, 00.03.59, etc.) ──
    if re.match(r'^\d{2}[:.]\d{2}[:.]\d{2}$', lower):
        return 0.0
    if re.match(r'^\d{2}:\d{2}$', lower):
        return 0.0

    # ── Numbers-only text (scoreboard, timer) ──
    if re.sub(r'[^0-9]', '', lower) == lower and len(lower) > 2:
        score -= 0.2

    # ── Position scoring (center = editor text, corners = platform UI) ──
    # bbox is [x1, y1, x2, y2]
    x1, y1, x2, y2 = bbox
    fw, fh = frame_size
    cx = ((x1 + x2) / 2) / max(fw, 1)
    cy = ((y1 + y2) / 2) / max(fh, 1)

    # Bottom-right corner = platform watermark zone
    if cx > 0.75 and cy > 0.75:
        score -= 0.4

    # Top-right = likely timestamp or platform UI
    if cx > 0.75 and cy < 0.25:
        score -= 0.25

    # Center = editor text (highest priority)
    if 0.3 < cx < 0.7 and 0.3 < cy < 0.7:
        score += 0.2
    elif 0.2 < cx < 0.8 and 0.2 < cy < 0.8:
        score += 0.1

    # ── Font size ──
    if fontSize in ("large", "xlarge"):
        score += 0.15
    elif fontSize == "small":
        score -= 0.05

    # ── Very short text is likely noise ──
    if len(text) < 3:
        score *= 0.5

    # ── Broadcast overlay patterns ──
    if any(kw in lower for kw in _EDITOR_PENALTY_KW):
        score -= 0.2

    return max(0.0, min(1.0, score))


def _run_ocr_on_frame(frame_path: str, use_easyocr: bool = False) -> tuple[list[dict], list[dict]]:
    """Run tesseract and optionally EasyOCR on a frame, return (tesseract_items, easyocr_items)."""
    tess_items = []
    easy_items = []

    if not os.path.exists(frame_path):
        return tess_items, easy_items

    img = Image.open(frame_path).convert("RGB")
    pixels = np.array(img, dtype=np.uint8)
    _, enhanced_img = _preprocess_for_ocr(img)

    # ── Tesseract on enhanced image ──
    try:
        ocr_data = pytesseract.image_to_data(
            enhanced_img, output_type=pytesseract.Output.DICT,
            config="--psm 6 --oem 3",
        )
        for i in range(len(ocr_data["text"])):
            conf = int(ocr_data["conf"][i])
            text = ocr_data["text"][i].strip()
            if conf < TEXT_CONFIDENCE_THRESHOLD or not text:
                continue
            if len(text) < 2 and not text.isalpha():
                continue
            if all(c in '.:;=<>|/\\-_+*&^%$#@!~`\'\"' for c in text):
                continue
            x, y, w, h = (
                ocr_data["left"][i], ocr_data["top"][i],
                ocr_data["width"][i], ocr_data["height"][i],
            )
            if w < 10 or h < 6:
                continue
            gray = np.array(enhanced_img, dtype=np.uint8)
            tess_items.append({
                "text": text,
                "confidence": round(conf / 100, 3),
                "bbox": [x, y, x + w, y + h],
                "fontSize": _classify_font_size(h, max(pixels.shape[:2])),
                "fontSizePx": h,
                "placement": _classify_placement(x, y, w, h, pixels.shape),
                "color": _extract_text_color(pixels[y:y + h, x:x + w]),
                "weight": _classify_weight(gray[y:y + h, x:x + w]),
                "_source": "tesseract",
            })
    except Exception:
        pass

    # ── EasyOCR on original image (optional, slow) ──
    if use_easyocr:
        reader = _get_easyocr()
        if reader:
            try:
                ocr2 = reader.readtext(frame_path)
                for bbox, txt, conf2 in ocr2:
                    txt = txt.strip()
                    if conf2 < 0.3 or not txt or len(txt) < 2:
                        continue
                    xs = [int(p[0]) for p in bbox]
                    ys = [int(p[1]) for p in bbox]
                    ex1, ey1, ex2, ey2 = min(xs), min(ys), max(xs), max(ys)
                    ew, eh = ex2 - ex1, ey2 - ey1
                    if ew < 10 or eh < 6:
                        continue
                    easy_items.append({
                        "text": txt,
                        "confidence": round(conf2, 3),
                        "bbox": [ex1, ey1, ex2, ey2],
                        "fontSize": _classify_font_size(eh, max(pixels.shape[:2])),
                        "fontSizePx": eh,
                        "placement": _classify_placement(ex1, ey1, ew, eh, pixels.shape),
                        "color": _extract_text_color(pixels[ey1:ey2, ex1:ex2]),
                        "weight": _classify_weight(np.mean(pixels, axis=2)[ey1:ey2, ex1:ex2]),
                        "_source": "easyocr",
                    })
            except Exception:
                pass

    return tess_items, easy_items


def _merge_ocr_results(tess_items: list[dict], easy_items: list[dict]) -> list[dict]:
    """Merge tesseract and EasyOCR results, deduplicating by text content."""
    # EasyOCR is generally more accurate — keep as-is
    # Tesseract items not overlapping with EasyOCR get added as supplementary
    merged = list(easy_items)

    easy_texts = set(c["text"].lower() for c in easy_items)
    for item in tess_items:
        key = item["text"].lower()
        if any(key in e or e in key for e in easy_texts):
            continue
        # Boost confidence for tesseract items that look like editor text
        item["confidence"] = min(1.0, item["confidence"] + 0.1)
        merged.append(item)

    # Deduplicate by exact text
    seen = set()
    deduped = []
    for c in sorted(merged, key=lambda x: x["confidence"], reverse=True):
        key = c["text"].lower().strip()
        if key not in seen:
            seen.add(key)
            deduped.append(c)

    return deduped


def _analyze_shot_text(frames: list[str], shot: dict, use_easyocr: bool = False) -> dict:
    """Run OCR + analysis on a shot's frames."""
    result: dict[str, Any] = {
        "hasText": False,
        "textCount": 0,
        "textRegions": [],
        "textContent": [],
        "properties": {},
        "confidence": 0.0,
        "confidenceThreshold": TEXT_CONFIDENCE_THRESHOLD,
    }

    try:
        all_content = []
        all_regions = []

        for frame_path in frames:
            if not os.path.exists(frame_path):
                continue

            pixels = np.array(Image.open(frame_path).convert("RGB"), dtype=np.uint8)
            frame_h, frame_w = pixels.shape[:2]

            # Pass 1 & 2: OCR (tesseract + optional EasyOCR, merged)
            tess_items, easy_items = _run_ocr_on_frame(frame_path, use_easyocr=use_easyocr)
            merged = _merge_ocr_results(tess_items, easy_items)

            # Score and filter
            for item in merged:
                bbox = item.get("bbox", (0, 0, 0, 0))
                editor_score = _score_editor_text(
                    item["text"], item["fontSize"],
                    item["placement"], item["confidence"],
                    bbox=bbox, frame_size=(frame_w, frame_h),
                )
                item["_editorScore"] = round(editor_score, 3)
                if item["confidence"] >= 0.4 or editor_score >= 0.5:
                    all_content.append(item)

            # Pass 3: Heuristic regions (legacy fallback)
            regions = _find_heuristic_regions(pixels)
            all_regions.extend(regions)

        if all_content:
            # Sort by editor score (most likely editor text first)
            all_content.sort(key=lambda c: c.get("_editorScore", c["confidence"]), reverse=True)
            result["hasText"] = True
            result["textCount"] = len(all_content)
            result["textContent"] = all_content[:10]
            result["confidence"] = max(c["confidence"] for c in all_content)
            result["properties"] = _aggregate_text_properties(all_content)

        elif all_regions:
            high_conf = [r for r in all_regions
                         if r.get("confidence", 0) >= TEXT_CONFIDENCE_THRESHOLD]
            if high_conf:
                result["hasText"] = True
                result["textCount"] = len(high_conf)
                result["textRegions"] = high_conf[:5]
                result["confidence"] = float(np.mean([r["confidence"] for r in high_conf]))
                result["properties"] = _aggregate_heuristic_properties(high_conf)

    except Exception:
        pass

    return result


def _classify_font_size(h_px: int, frame_h: int) -> str:
    ratio = h_px / max(frame_h, 1)
    if ratio < 0.03:
        return "small"
    elif ratio < 0.07:
        return "medium"
    elif ratio < 0.12:
        return "large"
    else:
        return "xlarge"


def _classify_placement(x: int, y: int, w: int, h: int, shape) -> str:
    fh, fw = shape[:2]
    cx, cy = x + w / 2, y + h / 2
    y_pos = "top" if cy < fh * 0.33 else ("bottom" if cy > fh * 0.67 else "center")
    x_pos = "left" if cx < fw * 0.33 else ("right" if cx > fw * 0.67 else "center")
    if y_pos == "center" and x_pos == "center":
        return "center"
    return f"{y_pos}_{x_pos}"


def _extract_text_color(region: np.ndarray) -> str:
    if region.size == 0:
        return "unknown"
    avg = region.mean(axis=(0, 1))
    r, g, b = avg
    if r > 200 and g > 200 and b > 200:
        return "white"
    if r < 50 and g < 50 and b < 50:
        return "black"
    if r > 150 and g < 100 and b < 100:
        return "red"
    if g > 150 and b < 100 and r < 100:
        return "green"
    if b > 150 and r < 100 and g < 100:
        return "blue"
    if r > 150 and g > 150 and b < 100:
        return "yellow"
    mx = max(r, g, b)
    if mx > 0:
        sat = (mx - min(r, g, b)) / mx
    else:
        sat = 0
    if sat < 0.2:
        return "white" if mx > 128 else "black"
    return "mixed"


def _classify_weight(region: np.ndarray) -> str:
    if region.size < 4:
        return "regular"
    dx = np.abs(np.diff(region.astype(float), axis=1))
    edge_density = (dx > 30).sum() / region.size
    if edge_density > 0.25:
        return "bold"
    if edge_density < 0.08:
        return "light"
    return "regular"


# ── Legacy heuristic fallback ──────────────────────────────────

def _find_heuristic_regions(pixels: np.ndarray) -> list[dict]:
    regions = []
    gray = np.mean(pixels, axis=2)
    h, w = gray.shape
    for win_h, win_w in [(32, 200), (64, 400), (96, 500)]:
        step_h = win_h // 2
        step_w = win_w // 2
        for y in range(0, h - win_h, step_h):
            for x in range(0, w - win_w, step_w):
                window = gray[y:y + win_h, x:x + win_w]
                conf = _compute_heuristic_conf(window)
                if conf > 30:
                    region = _analyze_heuristic_region(
                        pixels[y:y + win_h, x:x + win_w], x, y, win_w, win_h
                    )
                    if region:
                        region["confidence"] = conf
                        regions.append(region)
    return _merge_regions(regions)


def _compute_heuristic_conf(window: np.ndarray) -> float:
    h, w = window.shape
    dx = np.abs(np.diff(window, axis=1))
    dy = np.abs(np.diff(window, axis=0))
    edge_h, edge_v = float(dx.mean()), float(dy.mean())
    if edge_h < 10 or edge_v < 8:
        edge_score = 0.0
    elif edge_h > 50 or edge_v > 40:
        edge_score = 0.3
    else:
        edge_score = min(1.0, (edge_h + edge_v) / 40)
    br = float(window.max() - window.min())
    contrast_score = 0.0 if br < 80 else (0.8 if br > 200 else br / 200)
    aspect = w / max(1, h)
    aspect_score = 1.0 if 1.5 < aspect < 15 else (0.6 if 1.0 < aspect <= 1.5 or 15 <= aspect < 20 else 0.2)
    th = (window.max() + window.min()) / 2
    binary = (window > th).astype(float)
    h_t = np.abs(np.diff(binary, axis=1)).sum()
    v_t = np.abs(np.diff(binary, axis=0)).sum()
    total = h_t + v_t
    regularity_score = 0.0 if total < 5 or total > h * w * 0.4 else (0.9 if 20 < total < h * w * 0.15 else 0.5)
    return (edge_score * 0.3 + contrast_score * 0.3 + aspect_score * 0.2 + regularity_score * 0.2) * 100


def _analyze_heuristic_region(pixels: np.ndarray, x: int, y: int, w: int, h: int) -> Optional[dict]:
    try:
        gray = np.mean(pixels, axis=2)
        th = (gray.max() + gray.min()) / 2
        bright = gray > th
        if bright.sum() < 10:
            return None
        text_px = pixels[bright]
        avg = text_px.mean(axis=0)
        r, g, b = avg
        color = "white" if r > 200 and g > 200 and b > 200 else \
                "black" if r < 50 and g < 50 and b < 50 else \
                "red" if r > 150 and g < 100 else \
                "green" if g > 150 and b < 100 else \
                "blue" if b > 150 and r < 100 else \
                "yellow" if r > 150 and g > 150 else "mixed"
        size = "small" if h < 40 else ("medium" if h < 80 else ("large" if h < 120 else "xlarge"))
        dx_e = np.abs(np.diff(gray, axis=1))
        edge_d = (dx_e > 30).sum() / max(1, bright.sum())
        weight = "bold" if edge_d > 0.3 else ("light" if edge_d < 0.1 else "regular")
        fh, fw = 576, 576
        placement = _classify_placement(x, y, w, h, (fh, fw))
        has_shadow = False
        if y + h + 5 < fh and x + w + 5 < fw:
            sa = pixels[y + 3:y + min(h + 3, fh), x + 3:x + min(w + 3, fw)]
            sd = (sa.mean(axis=2) < 50).sum()
            has_shadow = sd > h * w * 0.1
        return {
            "x": x, "y": y, "width": w, "height": h,
            "color": color, "size": size, "weight": weight,
            "placement": placement, "hasShadow": has_shadow,
            "brightness": float(gray.mean()),
        }
    except Exception:
        return None


def _merge_regions(regions: list[dict]) -> list[dict]:
    if not regions:
        return []
    regions.sort(key=lambda r: r.get("confidence", 0) * r["width"] * r["height"], reverse=True)
    merged, used = [], set()
    for i, r1 in enumerate(regions):
        if i in used:
            continue
        for j, r2 in enumerate(regions[i + 1:], i + 1):
            if j in used:
                continue
            if (r1["x"] < r2["x"] + r2["width"] and
                r1["x"] + r1["width"] > r2["x"] and
                r1["y"] < r2["y"] + r2["height"] and
                r1["y"] + r1["height"] > r2["y"]):
                used.add(j)
        merged.append(r1)
    return merged[:5]


def _aggregate_text_properties(content: list[dict]) -> dict:
    colors = Counter(c["color"] for c in content)
    sizes = Counter(c["fontSize"] for c in content)
    placements = Counter(c["placement"] for c in content)
    return {
        "dominantColor": colors.most_common(1)[0][0] if colors else "white",
        "dominantSize": sizes.most_common(1)[0][0] if sizes else "medium",
        "dominantPlacement": placements.most_common(1)[0][0] if placements else "center",
        "totalTextItems": len(content),
        "textContent": [c["text"] for c in content[:5]],
    }


def _aggregate_heuristic_properties(regions: list[dict]) -> dict:
    colors = Counter(r["color"] for r in regions)
    sizes = Counter(r["size"] for r in regions)
    weights = Counter(r["weight"] for r in regions)
    placements = Counter(r["placement"] for r in regions)
    return {
        "dominantColor": colors.most_common(1)[0][0] if colors else "white",
        "dominantSize": sizes.most_common(1)[0][0] if sizes else "medium",
        "dominantWeight": weights.most_common(1)[0][0] if weights else "regular",
        "dominantPlacement": placements.most_common(1)[0][0] if placements else "center",
        "hasShadow": any(r["hasShadow"] for r in regions),
        "avgBrightness": sum(r["brightness"] for r in regions) / len(regions),
    }


def aggregate_text_results(text_per_shot: list[dict]) -> dict:
    """Aggregate text detection results across all shots."""
    shots_with_text = sum(1 for t in text_per_shot if t["hasText"])
    total_count = sum(t["textCount"] for t in text_per_shot)

    all_texts = []
    all_colors = []
    all_sizes = []
    all_placements = []

    for t in text_per_shot:
        for c in t.get("textContent", []):
            all_texts.append(c["text"])
            all_colors.append(c.get("color", "unknown"))
            all_sizes.append(c.get("fontSize", "medium"))
            all_placements.append(c.get("placement", "center"))
        props = t.get("properties", {})
        if not props:
            continue
        all_colors.append(props.get("dominantColor", "white"))
        all_sizes.append(props.get("dominantSize", "medium"))
        all_placements.append(props.get("dominantPlacement", "center"))

    return {
        "shotsWithText": shots_with_text,
        "totalTextRegions": total_count,
        "textFrequency": shots_with_text / len(text_per_shot) if text_per_shot else 0,
        "allTextContent": all_texts,
        "dominantColor": Counter(all_colors).most_common(1)[0][0] if all_colors else None,
        "dominantSize": Counter(all_sizes).most_common(1)[0][0] if all_sizes else None,
        "dominantPlacement": Counter(all_placements).most_common(1)[0][0] if all_placements else None,
        "hasText": shots_with_text > 0,
    }


# ── Text overlay visualisation ─────────────────────────────────

_VIS_COLORS = {
    "red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255),
    "yellow": (255, 255, 0), "white": (255, 255, 255), "black": (0, 0, 0),
    "mixed": (200, 200, 200), "unknown": (128, 128, 128),
}


def draw_text_overlay(frame: np.ndarray, text_content: list[dict]) -> np.ndarray:
    """Draw detected text overlays onto a frame for visualisation."""
    out = frame.copy()
    for item in text_content:
        bbox = item["bbox"]
        x1, y1, x2, y2 = bbox
        color = _VIS_COLORS.get(item.get("color", "white"), (0, 255, 0))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        label = item["text"]
        font_scale = 0.5
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
        cv2.rectangle(out, (x1, y1 - th - 4), (x1 + tw + 4, y1), color, -1)
        cv2.putText(out, label, (x1 + 2, y1 - 2),
                    cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 1)
    return out


def render_text_overlay_video(
    video_path: str,
    text_per_shot: list[dict],
    output_path: str,
    shots: list[dict],
    fps: float = 29.97,
    resolution: tuple[int, int] = (576, 576),
):
    """Render a video with text overlay bounding boxes and OCR content visible."""
    print(f"  Rendering text overlay video → {output_path}")

    w, h = resolution

    ffmpeg = subprocess.Popen([
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{w}x{h}", "-r", str(fps),
        "-i", "-",
        "-i", video_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_path,
    ], stdin=subprocess.PIPE)

    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_idx = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            t = frame_idx / fps

            text_items = []
            for si, shot in enumerate(shots):
                if shot["start"] <= t <= shot["end"] and si < len(text_per_shot):
                    text_items = text_per_shot[si].get("textContent", [])
                    break

            annotated = draw_text_overlay(frame, text_items)
            ffmpeg.stdin.write(annotated.tobytes())
            frame_idx += 1
            if frame_idx % 50 == 0:
                print(f"    {frame_idx}/{total} ({frame_idx / total * 100:.0f}%)", end="\r")
    finally:
        cap.release()
        ffmpeg.stdin.close()
        ffmpeg.wait()

    print(f"\n    Done: {output_path}")


# ── DEV / TEST ─────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python text_detector.py <video_path> [output_overlay.mp4]")
        sys.exit(1)

    video = sys.argv[1]
    shot = {"index": 0, "start": 8.0, "end": 10.0, "duration": 2.0}
    frames = _extract_frames(video, 8.0, 10.0)
    res = _analyze_shot_text(frames, shot)
    print(json.dumps(res, indent=2, default=str))

    if len(sys.argv) > 2:
        output = sys.argv[2]
        try:
            info = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries",
                 "format=duration", "-of", "json", video],
                capture_output=True, text=True,
            )
            dur = float(json.loads(info.stdout)["format"]["duration"])
            shots = [{"start": 0, "end": dur, "index": 0}]
            res2 = detect_text(video, shots)
            render_text_overlay_video(video, res2, output, shots)
        except Exception as e:
            print(f"Render error: {e}")
