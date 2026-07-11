"""
Optical Flow & Grading Engine
Farneback dense optical flow for frame interpolation.
Non-linear grading pipeline for clean corporate noir.
"""

import cv2
import numpy as np
import sys
import json


def apply_clean_grading(frame):
    """
    High-contrast tone mapping without crushing blacks or blowing highlights.
    Uses CLAHE on YUV luminance + sigmoid midtone curve.
    """
    yuv = cv2.cvtColor(frame, cv2.COLOR_BGR2YUV)
    y, u, v = cv2.split(yuv)

    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(6, 6))
    y = clahe.apply(y)

    yuv = cv2.merge((y, u, v))
    graded = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)

    # Sigmoid midtone curve
    lut = np.empty((1, 256), np.uint8)
    for i in range(256):
        normalized = i / 255.0
        curve = 1.0 / (1.0 + np.exp(-6.0 * (normalized - 0.5)))
        lut[0, i] = np.clip(curve * 255.0, 0, 255).astype(np.uint8)

    return cv2.LUT(graded, lut)


def warp_frame_optical_flow(frame1, frame2, alpha):
    """
    Interpolates an intermediate frame at fractional position alpha [0-1]
    using Farneback Dense Optical Flow.
    """
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

    flow = cv2.calcOpticalFlowFarneback(
        prev=gray1, next=gray2, flow=None,
        pyr_scale=0.5, levels=3, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2, flags=0
    )

    h, w = flow.shape[:2]
    map_x, map_y = np.meshgrid(np.arange(w), np.arange(h))

    flow_x = flow[..., 0]
    flow_y = flow[..., 1]

    map1_x = (map_x + flow_x * alpha).astype(np.float32)
    map1_y = (map_y + flow_y * alpha).astype(np.float32)
    map2_x = (map_x - flow_x * (1.0 - alpha)).astype(np.float32)
    map2_y = (map_y - flow_y * (1.0 - alpha)).astype(np.float32)

    warp1 = cv2.remap(frame1, map1_x, map1_y, cv2.INTER_LINEAR)
    warp2 = cv2.remap(frame2, map2_x, map2_y, cv2.INTER_LINEAR)

    return cv2.addWeighted(warp1, 1.0 - alpha, warp2, alpha, 0)


def process_pipeline(video_path, output_path, frame_mappings_json):
    """
    Time-remapping loop with optical flow interpolation + clean grading.
    """
    target_mappings = json.loads(frame_mappings_json)

    cap = cv2.VideoCapture(video_path)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_cache = {}

    def get_frame(idx):
        if idx in frame_cache:
            return frame_cache[idx]
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            return None
        frame_cache[idx] = frame
        return frame

    total = len(target_mappings)
    for target_idx, src_mapping in enumerate(target_mappings):
        lower_frame_idx = int(np.floor(src_mapping))
        upper_frame_idx = lower_frame_idx + 1
        alpha = src_mapping - lower_frame_idx

        f1 = get_frame(lower_frame_idx)
        if f1 is None:
            break

        f2 = get_frame(upper_frame_idx)
        if f2 is None or alpha == 0.0:
            processed_frame = f1
        else:
            processed_frame = warp_frame_optical_flow(f1, f2, alpha)

        graded_frame = apply_clean_grading(processed_frame)
        out.write(graded_frame)

        if target_idx % 50 == 0:
            print(f"  {target_idx}/{total} frames...")

    cap.release()
    out.release()
    print(f"  Done: {total} frames")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python pipeline.py input.mp4 output.mp4 '[0.0, 0.8, 1.9, ...]'")
        sys.exit(1)

    process_pipeline(sys.argv[1], sys.argv[2], sys.argv[3])
