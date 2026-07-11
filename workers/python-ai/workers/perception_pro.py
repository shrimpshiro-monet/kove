"""
perception_pro.py — upgraded reference + footage perception.
  Shots:     TransNetV2  -> PySceneDetect fallback
  Flow:      RAFT        -> Farneback fallback
  Semantics: CLIP zero-shot
  Faces:     mediapipe
  Velocity U-curves: derived from flow (drives speed_ramp placement)

Install:
    pip install torch torchvision            # RAFT + TransNetV2 backends
    pip install transnetv2-pytorch
    pip install open-clip-torch
    pip install mediapipe
    pip install opencv-python pillow numpy
"""
from __future__ import annotations
import json
import sys
from typing import Optional
import numpy as np


# ============================================================
# SHOTS: TransNetV2 -> PySceneDetect fallback
# ============================================================
def detect_shots(video_path: str) -> tuple[list[dict], str]:
    try:
        import torch
        from transnetv2_pytorch import TransNetV2
        model = TransNetV2(device="cuda" if torch.cuda.is_available() else "cpu")
        model.eval()
        with torch.no_grad():
            scenes = model.detect_scenes(video_path)
        out = [
            {
                "index": int(s["shot_id"]),
                "start_time": float(s["start_time"]),
                "end_time": float(s["end_time"]),
                "duration": float(s["end_time"]) - float(s["start_time"]),
            }
            for s in scenes
        ]
        if out:
            return out, "transnetv2"
    except Exception:
        pass
    try:
        from deep_analysis import detect_shots_pyscenedetect
        return [
            {"index": s.index, "start_time": s.start_time,
             "end_time": s.end_time, "duration": s.duration}
            for s in detect_shots_pyscenedetect(video_path)
        ], "pyscenedetect"
    except Exception:
        return [], "none"


# ============================================================
# OPTICAL FLOW: RAFT -> Farneback fallback
# ============================================================
def flow_velocity(video_path: str, stride: int = 3) -> tuple[list[dict], str]:
    try:
        import torch, cv2
        from torchvision.models.optical_flow import raft_small, Raft_Small_Weights

        weights = Raft_Small_Weights.DEFAULT
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = raft_small(weights=weights, progress=False).to(device).eval()
        tf = weights.transforms()

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        prev = None
        idx = 0
        out: list[dict] = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % stride == 0:
                small = cv2.resize(frame, (512, 288))
                rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                t = torch.from_numpy(rgb).permute(2, 0, 1).float()[None] / 255.0
                if prev is not None:
                    a, b = tf(prev, t)
                    with torch.no_grad():
                        flow = model(a.to(device), b.to(device))[-1][0].cpu().numpy()
                    fx, fy = flow[0], flow[1]
                    mag = float(np.sqrt(fx ** 2 + fy ** 2).mean())
                    dx, dy = float(fx.mean()), float(fy.mean())
                    direction = (
                        "right" if dx > 1 else
                        "left" if dx < -1 else
                        "down" if dy > 1 else
                        "up" if dy < -1 else "none"
                    )
                    out.append({"timestamp": idx / fps, "magnitude": mag, "direction": direction})
                prev = t
            idx += 1
        cap.release()
        if out:
            return out, "raft"
    except Exception:
        pass
    try:
        from deep_analysis import compute_optical_flow
        return [
            {"timestamp": v.timestamp, "magnitude": v.magnitude, "direction": "none"}
            for v in compute_optical_flow(video_path)
        ], "farneback"
    except Exception:
        return [], "none"


# ============================================================
# SEMANTICS: CLIP zero-shot tagging
# ============================================================
_CLIP_LABELS = [
    "confident person walking",
    "adjusting tie or suit",
    "close-up face reaction",
    "dialogue conversation",
    "fast hand gesture",
    "luxury interior or office",
    "crowd or audience",
    "product close-up",
    "outdoor city street",
    "emotional facial expression",
    "high action motion",
    "static talking head",
    "sports action",
    "car or vehicle",
    "nature or landscape",
]


def clip_tags(video_path: str, shots: list[dict]) -> list[dict]:
    try:
        import torch, cv2, open_clip
        from PIL import Image

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="laion2b_s34b_b79k"
        )
        tokenizer = open_clip.get_tokenizer("ViT-B-32")
        model = model.to(device).eval()

        text = tokenizer(_CLIP_LABELS).to(device)
        with torch.no_grad():
            tfeat = model.encode_text(text)
            tfeat /= tfeat.norm(dim=-1, keepdim=True)

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        results = []
        for s in shots:
            mid = (s["start_time"] + s["end_time"]) / 2
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(mid * fps))
            ret, frame = cap.read()
            if not ret:
                results.append({**s, "semantic": []})
                continue
            img = preprocess(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))[None].to(device)
            with torch.no_grad():
                ifeat = model.encode_image(img)
                ifeat /= ifeat.norm(dim=-1, keepdim=True)
                sims = (ifeat @ tfeat.T)[0].cpu().numpy()
            top = np.argsort(sims)[-3:][::-1]
            results.append({**s, "semantic": [_CLIP_LABELS[i] for i in top]})
        cap.release()
        return results
    except Exception:
        return [{**s, "semantic": []} for s in shots]


# ============================================================
# FACE CENTERING: mediapipe
# ============================================================
def face_centering(video_path: str, shots: list[dict]) -> dict:
    try:
        import cv2, mediapipe as mp
        fd = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5
        )
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        out = {}
        for s in shots:
            mid = (s["start_time"] + s["end_time"]) / 2
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(mid * fps))
            ret, frame = cap.read()
            if not ret:
                out[s["index"]] = {"faceCentered": False, "faceX": None}
                continue
            res = fd.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if res.detections:
                box = res.detections[0].location_data.relative_bounding_box
                cx = box.xmin + box.width / 2
                out[s["index"]] = {"faceCentered": bool(0.3 < cx < 0.7), "faceX": float(cx)}
            else:
                out[s["index"]] = {"faceCentered": False, "faceX": None}
        cap.release()
        return out
    except Exception:
        return {}


# ============================================================
# VELOCITY U-CURVES: detect speed-ramp candidates per shot
# ============================================================
def detect_velocity_ramps(shots: list[dict], velocity: list[dict]) -> dict:
    out = {}
    for s in shots:
        samples = [v["magnitude"] for v in velocity
                   if s["start_time"] <= v["timestamp"] < s["end_time"]]
        if len(samples) < 5:
            out[s["index"]] = False
            continue
        arr = np.array(samples)
        n = len(arr)
        third = max(1, n // 3)
        early = arr[:third].mean()
        mid = arr[third:2 * third].mean()
        late = arr[2 * third:].mean()
        is_u = mid < early * 0.7 and mid < late * 0.7
        out[s["index"]] = bool(is_u)
    return out


def run(video_path: str) -> dict:
    shots, shot_backend = detect_shots(video_path)
    velocity, flow_backend = flow_velocity(video_path)
    shots = clip_tags(video_path, shots)
    faces = face_centering(video_path, shots)
    ramps = detect_velocity_ramps(shots, velocity)

    for s in shots:
        seg = [v for v in velocity if s["start_time"] <= v["timestamp"] < s["end_time"]]
        if seg:
            dirs = [v["direction"] for v in seg]
            s["motionDir"] = max(set(dirs), key=dirs.count)
            s["motion"] = float(np.mean([v["magnitude"] for v in seg]))
        else:
            s["motionDir"] = "none"
            s["motion"] = 0.0
        f = faces.get(s["index"], {})
        s["faceCentered"] = f.get("faceCentered", False)
        s["faceX"] = f.get("faceX")
        s["hasVelocityRamp"] = ramps.get(s["index"], False)

    return {
        "shots": shots,
        "velocity": velocity,
        "backends": {
            "shots": shot_backend,
            "flow": flow_backend,
        },
    }


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1])))
