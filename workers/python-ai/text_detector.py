"""
Text detection in video frames using PaddleOCR.
Completely free, Apache-2.0, runs on CPU.
"""
import cv2
import numpy as np
import json
import sys

try:
    from paddleocr import PaddleOCR
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

def detect_text_in_video(video_path: str, sample_interval: float = 0.5) -> list:
    """Detect text regions in video frames."""
    if not HAS_PADDLE:
        return detect_text_opencv(video_path, sample_interval)

    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(fps * sample_interval))

    detections = []
    prev_texts = set()

    for frame_idx in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        timestamp = frame_idx / fps
        result = ocr.ocr(frame, cls=True)

        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
                text = line[1][0]
                confidence = line[1][1]

                if confidence < 0.6:
                    continue

                x_min = min(p[0] for p in bbox)
                y_min = min(p[1] for p in bbox)
                x_max = max(p[0] for p in bbox)
                y_max = max(p[1] for p in bbox)
                width = x_max - x_min
                height = y_max - y_min

                frame_h, frame_w = frame.shape[:2]
                center_x = (x_min + x_max) / 2 / frame_w
                center_y = (y_min + y_max) / 2 / frame_h
                norm_width = width / frame_w
                norm_height = height / frame_h

                if center_y < 0.3:
                    position = "top"
                elif center_y > 0.7:
                    position = "bottom"
                else:
                    position = "center"

                roi = frame[int(y_min):int(y_max), int(x_min):int(x_max)]
                if roi.size > 0:
                    mean_brightness = np.mean(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY))
                    is_white = mean_brightness > 200
                    edges = cv2.Canny(roi, 50, 150)
                    edge_density = np.mean(edges) / 255.0
                    has_stroke = edge_density > 0.3
                else:
                    is_white = True
                    has_stroke = False

                text_key = f"{text}_{position}"
                if text_key not in prev_texts:
                    prev_texts.add(text_key)
                    detections.append({
                        "text": text,
                        "timestamp": round(timestamp, 3),
                        "position": position,
                        "centerX": round(center_x, 3),
                        "centerY": round(center_y, 3),
                        "width": round(norm_width, 3),
                        "height": round(norm_height, 3),
                        "isWhite": is_white,
                        "hasStroke": has_stroke,
                        "confidence": round(confidence, 3),
                    })

    cap.release()
    return detections

def detect_text_opencv(video_path: str, sample_interval: float = 0.5) -> list:
    """Fallback: contour-based text detection without PaddleOCR."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(fps * sample_interval))

    detections = []
    for frame_idx in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        timestamp = frame_idx / fps
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w > 20 and h > 10:
                frame_h, frame_w = frame.shape[:2]
                detections.append({
                    "text": "[detected]",
                    "timestamp": round(timestamp, 3),
                    "position": "unknown",
                    "centerX": round((x + w / 2) / frame_w, 3),
                    "centerY": round((y + h / 2) / frame_h, 3),
                    "width": round(w / frame_w, 3),
                    "height": round(h / frame_h, 3),
                    "isWhite": True,
                    "hasStroke": False,
                    "confidence": 0.5,
                })

    cap.release()
    return detections

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python text_detector.py <video_path>")
        sys.exit(1)

    detections = detect_text_in_video(sys.argv[1])
    print(json.dumps(detections, indent=2))