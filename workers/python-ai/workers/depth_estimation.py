"""
depth_estimation.py — monocular depth estimation for parallax effects.

Uses MiDaS (Intel) for per-frame depth maps. Enables:
  - 2.5D parallax transitions
  - Depth-based blur (bokeh)
  - Subject/background separation
  - Camera movement estimation

Install:
    pip install torch torchvision timm
    (MiDaS model downloads automatically on first run)
"""
from __future__ import annotations
import json
import sys
import numpy as np
from typing import Optional


def estimate_depth(frame_array: np.ndarray) -> dict:
    """Estimate depth map from a single frame (BGR numpy array)."""
    try:
        import torch
        import cv2
        
        # Load MiDaS model
        model_type = "DPT_Large"  # or "DPT_Hybrid" for speed
        midas = torch.hub.load("intel-isl/MiDaS", model_type)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        midas.to(device).eval()
        
        # Load transforms
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
        if model_type in ["DPT_Large", "DPT_Hybrid"]:
            transform = midas_transforms.dpt_transform
        else:
            transform = midas_transforms.small_transform
        
        # Preprocess
        img_rgb = cv2.cvtColor(frame_array, cv2.COLOR_BGR2RGB)
        input_batch = transform(img_rgb).to(device)
        
        # Inference
        with torch.no_grad():
            prediction = midas(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=frame_array.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        
        depth = prediction.cpu().numpy()
        
        # Normalize to 0-1
        depth_min = depth.min()
        depth_max = depth.max()
        if depth_max > depth_min:
            depth_norm = (depth - depth_min) / (depth_max - depth_min)
        else:
            depth_norm = np.zeros_like(depth)
        
        # Analyze depth distribution
        h, w = depth_norm.shape
        center_depth = depth_norm[h//4:3*h//4, w//4:3*w//4].mean()
        edges_depth = np.concatenate([
            depth_norm[:h//4, :].flatten(),
            depth_norm[3*h//4:, :].flatten(),
            depth_norm[:, :w//4].flatten(),
            depth_norm[:, 3*w//4:].flatten(),
        ]).mean()
        
        # Determine parallax potential
        depth_variance = depth_norm.var()
        has_parallax = depth_variance > 0.01 and abs(center_depth - edges_depth) > 0.05
        
        # Find foreground/background regions
        fg_mask = (depth_norm > 0.6).astype(np.uint8) * 255
        bg_mask = (depth_norm < 0.4).astype(np.uint8) * 255
        
        return {
            "success": True,
            "depth_mean": float(depth_norm.mean()),
            "depth_std": float(depth_norm.std()),
            "center_depth": float(center_depth),
            "edges_depth": float(edges_depth),
            "depth_variance": float(depth_variance),
            "has_parallax": has_parallax,
            "parallax_strength": float(abs(center_depth - edges_depth)),
            "fg_ratio": float(fg_mask.sum() / (255 * h * w)),
            "bg_ratio": float(bg_mask.sum() / (255 * h * w)),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def estimate_depth_batch(video_path: str, stride: int = 30) -> list[dict]:
    """Estimate depth for sampled frames from a video."""
    try:
        import cv2
        
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        results = []
        idx = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % stride == 0:
                small = cv2.resize(frame, (384, 384))
                depth_info = estimate_depth(small)
                depth_info["timestamp"] = idx / fps
                results.append(depth_info)
            idx += 1
        
        cap.release()
        return results
    except Exception as e:
        return [{"success": False, "error": str(e)}]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: depth_estimation.py <image_or_video_path>"}))
        sys.exit(1)
    
    path = sys.argv[1]
    if path.lower().endswith(('.mp4', '.mov', '.avi', '.mkv')):
        results = estimate_depth_batch(path)
        print(json.dumps({"frames": results, "count": len(results)}))
    else:
        import cv2
        frame = cv2.imread(path)
        if frame is None:
            print(json.dumps({"error": f"Could not read {path}"}))
            sys.exit(1)
        result = estimate_depth(frame)
        print(json.dumps(result))
