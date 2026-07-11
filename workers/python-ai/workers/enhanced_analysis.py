"""
enhanced_analysis.py — advanced perception using rembg, YOLO, and OCR.

  Background removal: rembg (u2net) — subject isolation for overlays
  Object detection:   YOLOv8 — shot composition analysis
  Text detection:     pytesseract — reference text overlay extraction

Install:
    pip install rembg pytesseract ultralytics onnxruntime pillow
"""
from __future__ import annotations
import json
import sys
import tempfile
import os
from typing import Optional
import numpy as np


def remove_background(image_path: str) -> dict:
    """Remove background from a single frame. Returns mask + RGBA image."""
    # Try rembg first, fall back to GrabCut if pymatting unavailable
    try:
        from rembg import remove
        from PIL import Image
        
        img = Image.open(image_path)
        result = remove(img)
        
        rgba = np.array(result)
        mask = rgba[:, :, 3]
        
        output_path = image_path.rsplit('.', 1)[0] + '_nobg.png'
        result.save(output_path)
        
        subject_area = (mask > 128).sum()
        total_area = mask.shape[0] * mask.shape[1]
        subject_ratio = subject_area / total_area
        
        ys, xs = np.where(mask > 128)
        bbox = None
        if len(ys) > 0:
            bbox = {
                "x_min": int(xs.min()), "y_min": int(ys.min()),
                "x_max": int(xs.max()), "y_max": int(ys.max()),
                "center_x": (xs.min() + xs.max()) / 2 / mask.shape[1],
                "center_y": (ys.min() + ys.max()) / 2 / mask.shape[0],
            }
        
        return {"success": True, "output_path": output_path, "subject_ratio": float(subject_ratio), "bbox": bbox, "has_subject": subject_ratio > 0.05, "method": "rembg"}
    except (ImportError, ModuleNotFoundError):
        pass
    
    # Fallback: OpenCV GrabCut
    try:
        import cv2
        from PIL import Image
        
        img = cv2.imread(image_path)
        h, w = img.shape[:2]
        
        mask = np.zeros((h, w), np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        
        rect = (int(w * 0.1), int(h * 0.1), int(w * 0.8), int(h * 0.8))
        cv2.grabCut(img, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
        
        mask2 = np.where((mask == 2) | (mask == 0), 0, 255).astype('uint8')
        
        subject_area = (mask2 > 128).sum()
        total_area = mask2.shape[0] * mask2.shape[1]
        subject_ratio = subject_area / total_area
        
        output_path = image_path.rsplit('.', 1)[0] + '_nobg.png'
        cv2.imwrite(output_path, mask2)
        
        return {"success": True, "output_path": output_path, "subject_ratio": float(subject_ratio), "bbox": None, "has_subject": subject_ratio > 0.05, "method": "grabcut"}
    except Exception as e:
        return {"success": False, "error": str(e), "method": "none"}


def detect_objects_yolo(image_path: str, confidence: float = 0.3) -> dict:
    """Detect objects in a frame using YOLOv8."""
    try:
        from ultralytics import YOLO
        
        model = YOLO("yolov8n.pt")  # nano model for speed
        results = model(image_path, conf=confidence, verbose=False)
        
        objects = []
        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()
                label = r.names[cls]
                
                # Calculate center and area
                cx = (xyxy[0] + xyxy[2]) / 2
                cy = (xyxy[1] + xyxy[3]) / 2
                area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                
                objects.append({
                    "label": label,
                    "confidence": conf,
                    "bbox": {
                        "x_min": xyxy[0], "y_min": xyxy[1],
                        "x_max": xyxy[2], "y_max": xyxy[3],
                        "center_x": cx / r.orig_shape[1],  # Normalized
                        "center_y": cy / r.orig_shape[0],
                        "area_ratio": area / (r.orig_shape[0] * r.orig_shape[1]),
                    },
                })
        
        # Classify shot composition
        composition = classify_composition(objects)
        
        return {
            "success": True,
            "objects": objects,
            "composition": composition,
            "object_count": len(objects),
        }
    except Exception as e:
        return {"success": False, "error": str(e), "objects": [], "composition": "unknown"}


def classify_composition(objects: list[dict]) -> str:
    """Classify shot composition based on detected objects."""
    if not objects:
        return "empty"
    
    labels = [o["label"] for o in objects]
    
    # Person-centric
    person_count = labels.count("person")
    if person_count >= 2:
        return "two_shot"
    elif person_count == 1:
        person = next(o for o in objects if o["label"] == "person")
        area = person["bbox"]["area_ratio"]
        if area > 0.3:
            return "closeup"
        elif area > 0.1:
            return "medium_shot"
        else:
            return "wide_shot"
    
    # Object-centric
    if any(l in labels for l in ["car", "truck", "bus", "motorcycle"]):
        return "vehicle"
    if any(l in labels for l in ["chair", "couch", "bed", "table"]):
        return "interior"
    if any(l in labels for l in ["tree", "plant", "flower"]):
        return "nature"
    if any(l in labels for l in ["bottle", "cup", "wine glass"]):
        return "product"
    
    return "object"


def detect_text_ocr(image_path: str) -> dict:
    """Detect text in a frame using pytesseract."""
    try:
        import pytesseract
        from PIL import Image
        
        img = Image.open(image_path)
        
        # Get detailed OCR data
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        
        texts = []
        for i in range(len(data["text"])):
            text = data["text"][i].strip()
            conf = int(data["conf"][i])
            if text and conf > 30:  # Minimum confidence
                x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                texts.append({
                    "text": text,
                    "confidence": conf / 100.0,
                    "bbox": {
                        "x": x, "y": y, "width": w, "height": h,
                        "center_x": (x + w / 2) / img.width,
                        "center_y": (y + h / 2) / img.height,
                    },
                    "position": classify_text_position(x, y, w, h, img.width, img.height),
                })
        
        # Merge nearby text blocks
        merged = merge_text_blocks(texts)
        
        return {
            "success": True,
            "texts": merged,
            "text_count": len(merged),
            "has_text": len(merged) > 0,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "texts": [], "has_text": False}


def classify_text_position(x, y, w, h, img_w, img_h) -> str:
    """Classify where text appears in the frame."""
    cx = (x + w / 2) / img_w
    cy = (y + h / 2) / img_h
    
    if cy < 0.2:
        return "top"
    elif cy > 0.8:
        return "bottom"
    elif cx < 0.3:
        return "left"
    elif cx > 0.7:
        return "right"
    else:
        return "center"


def merge_text_blocks(texts: list[dict]) -> list[dict]:
    """Merge nearby text blocks into single entries."""
    if not texts:
        return []
    
    # Sort by position (top-to-bottom, left-to-right)
    texts.sort(key=lambda t: (t["bbox"]["center_y"], t["bbox"]["center_x"]))
    
    merged = []
    current = texts[0]
    
    for t in texts[1:]:
        # Check if close enough to merge
        dy = abs(t["bbox"]["center_y"] - current["bbox"]["center_y"])
        dx = abs(t["bbox"]["center_x"] - current["bbox"]["center_x"])
        
        if dy < 0.05 and dx < 0.15:  # Same line, close horizontally
            current["text"] += " " + t["text"]
            current["confidence"] = min(current["confidence"], t["confidence"])
        else:
            merged.append(current)
            current = t
    
    merged.append(current)
    return merged


def analyze_frame(image_path: str) -> dict:
    """Run all enhanced analysis on a single frame."""
    bg = remove_background(image_path)
    objects = detect_objects_yolo(image_path)
    text = detect_text_ocr(image_path)
    
    return {
        "background_removal": bg,
        "object_detection": objects,
        "text_detection": text,
        "composition": objects.get("composition", "unknown"),
        "has_subject": bg.get("has_subject", False),
        "has_text": text.get("has_text", False),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: enhanced_analysis.py <image_path>"}))
        sys.exit(1)
    
    class NumpyEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, np.floating):
                return float(obj)
            if isinstance(obj, (np.integer, np.bool_)):
                return bool(obj) if isinstance(obj, np.bool_) else int(obj)
            return super().default(obj)
    
    result = analyze_frame(sys.argv[1])
    print(json.dumps(result, cls=NumpyEncoder))
