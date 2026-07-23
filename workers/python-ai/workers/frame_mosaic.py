"""Frame mosaic — combines extracted frames into a single contact sheet image."""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np


def create_mosaic(
    frame_dir: str,
    output_path: str,
    cols: int = 6,
    thumb_width: int = 320,
    thumb_height: int = 180,
    padding: int = 4,
    bg_color: tuple[int, int, int] = (20, 20, 20),
    label_frames: bool = True,
    fps: float = 3.0,
) -> str:
    """Create a contact sheet / mosaic from extracted frames.
    
    Args:
        frame_dir: Directory containing frame_*.jpg files
        output_path: Where to save the mosaic image
        cols: Number of columns in the grid
        thumb_width: Width of each thumbnail
        thumb_height: Height of each thumbnail
        padding: Pixels between thumbnails
        bg_color: Background color (BGR)
        label_frames: Whether to add frame number labels
        fps: Frame rate used during extraction (for timestamp labels)
    
    Returns:
        Path to the created mosaic image
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    if not frame_files:
        return ""
    
    n_frames = len(frame_files)
    rows = (n_frames + cols - 1) // cols
    
    # Calculate canvas size
    canvas_w = cols * (thumb_width + padding) + padding
    canvas_h = rows * (thumb_height + padding) + padding
    
    canvas = np.full((canvas_h, canvas_w, 3), bg_color, dtype=np.uint8)
    
    for i, fp in enumerate(frame_files):
        row = i // cols
        col = i % cols
        
        x = padding + col * (thumb_width + padding)
        y = padding + row * (thumb_height + padding)
        
        # Read and resize frame
        img = cv2.imread(str(fp))
        if img is None:
            continue
        
        # Resize maintaining aspect ratio
        h, w = img.shape[:2]
        scale = min(thumb_width / w, thumb_height / h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(img, (new_w, new_h))
        
        # Center in thumbnail cell
        offset_x = (thumb_width - new_w) // 2
        offset_y = (thumb_height - new_h) // 2
        
        canvas[y + offset_y:y + offset_y + new_h, x + offset_x:x + offset_x + new_w] = resized
        
        # Add frame label
        if label_frames:
            timestamp = i / fps
            label = f"{i+1} ({timestamp:.1f}s)"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.4
            thickness = 1
            (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)
            cv2.putText(canvas, label, (x + 4, y + thumb_height - 6), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
    
    # Add title bar
    title_h = 30
    title_canvas = np.full((title_h, canvas_w, 3), (40, 40, 40), dtype=np.uint8)
    title = f"Frame Mosaic — {n_frames} frames @ {fps}fps ({n_frames/fps:.1f}s)"
    cv2.putText(title_canvas, title, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1, cv2.LINE_AA)
    
    final = np.vstack([title_canvas, canvas])
    
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    cv2.imwrite(output_path, final, [cv2.IMWRITE_JPEG_QUALITY, 85])
    
    return output_path


def get_mosaic_base64(frame_dir: str, fps: float = 3.0) -> str:
    """Create mosaic and return as base64 string for API calls."""
    import base64
    
    temp_path = os.path.join(frame_dir, "_mosaic.jpg")
    create_mosaic(frame_dir, temp_path, fps=fps)
    
    if not os.path.exists(temp_path):
        return ""
    
    with open(temp_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    
    os.remove(temp_path)
    return b64
