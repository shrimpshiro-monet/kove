from __future__ import annotations

import importlib
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

try:
    from pycocotools import mask as mask_utils
    HAS_PYCOCOTOOLS = True
except ImportError:
    HAS_PYCOCOTOOLS = False

try:
    import open_clip
    import torch
    HAS_OPEN_CLIP = True
except ImportError:
    HAS_OPEN_CLIP = False
    torch = None  # type: ignore[assignment]


@dataclass
class ShotSpec:
    shot_id: str
    start_frame: int
    end_frame: int


@dataclass
class SubjectSeed:
    subject_id: int
    label: str
    seed_frame: int
    seed_box: list[float]


@dataclass
class TrackMaskRequest:
    video_path: str
    shots: list[ShotSpec]
    subjects: list[SubjectSeed]
    frame_step: int = 2
    max_frames_per_shot: int = 300
    working_width: int = 1280
    checkpoint_path: str | None = None
    model_config: str | None = None
    enable_reid: bool = True
    reid_threshold: float = 0.75


@dataclass
class TrackedMaskFrame:
    frame_idx: int
    timestamp: float
    bbox: list[int]
    mask_rle: dict
    confidence: float
    occluded: bool


class _ReIDEmbedder:
    def __init__(self, device: str | None = None):
        self._model = None
        self._preprocess = None
        if device:
            self._device = device
        elif torch is not None and torch.cuda.is_available():
            self._device = "cuda"
        else:
            self._device = "cpu"

    def _lazy_init(self):
        if self._model is not None:
            return
        if not HAS_OPEN_CLIP:
            return
        model_name = "ViT-B-32"
        pretrained = "laion2b_s34b_b79k"
        self._model, _, self._preprocess = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained, device=self._device
        )
        self._model.eval()

    def get_embedding(self, frame_rgb: np.ndarray, mask: np.ndarray) -> np.ndarray | None:
        self._lazy_init()
        if self._model is None:
            return None
        ys, xs = np.where(mask > 0)
        if len(xs) == 0 or len(ys) == 0:
            return None
        x1, x2 = int(xs.min()), int(xs.max())
        y1, y2 = int(ys.min()), int(ys.max())
        crop = frame_rgb[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        from PIL import Image
        pil_img = Image.fromarray(crop)
        input_tensor = self._preprocess(pil_img).unsqueeze(0).to(self._device)
        with torch.no_grad():
            emb = self._model.encode_image(input_tensor)
            emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy().flatten()

    @staticmethod
    def match(embedding: np.ndarray, known_subjects: dict[int, np.ndarray], threshold: float) -> int | None:
        best_id = None
        best_sim = threshold
        for subj_id, known_emb in known_subjects.items():
            sim = float(np.dot(embedding, known_emb) / (np.linalg.norm(embedding) * np.linalg.norm(known_emb) + 1e-8))
            if sim > best_sim:
                best_sim = sim
                best_id = subj_id
        return best_id


def _require_sam2_video() -> tuple[Any, Any]:
    try:
        build_module = importlib.import_module("sam2.build_sam")
        predictor_module = importlib.import_module("sam2.sam2_video_predictor")
        return build_module, predictor_module
    except ImportError as exc:
        raise RuntimeError(
            "SAM2 video predictor not available. Install with: pip install 'sam2>=1.1.0'"
        ) from exc


def _extract_shot_frames(
    video_path: str,
    start_frame: int,
    end_frame: int,
    output_dir: str,
    step: int,
    target_width: int,
    max_frames: int = 300,
) -> tuple[int, int, float]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Failed to open video: {video_path}")

    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    scale = target_width / orig_w if orig_w > 0 else 1.0
    target_h = int(round(orig_h * scale))

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    total = min(end_frame - start_frame, max_frames * step)
    written = 0
    for i in range(total):
        ok, frame = cap.read()
        if not ok:
            break
        if i % step != 0:
            continue
        if scale != 1.0:
            frame = cv2.resize(frame, (target_width, target_h), interpolation=cv2.INTER_AREA)
        out_path = str(Path(output_dir) / f"{written + 1:06d}.jpg")
        cv2.imwrite(out_path, frame)
        written += 1

    cap.release()
    return written, target_h, fps


def _mask_to_rle(mask: np.ndarray) -> dict:
    if not HAS_PYCOCOTOOLS:
        return {"size": list(mask.shape), "counts": ""}
    fortran = np.asfortranarray(mask.astype(np.uint8))
    rle = mask_utils.encode(fortran)
    if isinstance(rle["counts"], bytes):
        rle["counts"] = rle["counts"].decode("utf-8")
    return rle


def _mask_to_bbox(mask: np.ndarray) -> list[int]:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return [0, 0, 0, 0]
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def _mask_confidence(mask_logit: np.ndarray | None, mask: np.ndarray) -> float:
    if mask_logit is None:
        return 1.0 if mask.any() else 0.0
    prob = 1.0 / (1.0 + np.exp(-mask_logit))
    region = prob[mask > 0]
    return float(region.mean()) if region.size > 0 else 0.0


def _scale_box(box: list[float], src_w: int, src_h: int, dst_w: int, dst_h: int) -> list[float]:
    sx = dst_w / src_w if src_w > 0 else 1.0
    sy = dst_h / src_h if src_h > 0 else 1.0
    x1 = max(0.0, min(box[0] * sx, float(dst_w - 1)))
    y1 = max(0.0, min(box[1] * sy, float(dst_h - 1)))
    x2 = max(0.0, min(box[2] * sx, float(dst_w - 1)))
    y2 = max(0.0, min(box[3] * sy, float(dst_h - 1)))
    if x2 <= x1:
        x2 = min(x1 + 1.0, float(dst_w - 1))
    if y2 <= y1:
        y2 = min(y1 + 1.0, float(dst_h - 1))
    return [x1, y1, x2, y2]


def track_mask(request: TrackMaskRequest) -> dict[str, Any]:
    if not request.video_path:
        raise ValueError("video_path is required")
    if not request.shots:
        raise ValueError("at least one shot is required")
    if not request.subjects:
        raise ValueError("at least one subject is required")

    for shot in request.shots:
        if shot.start_frame >= shot.end_frame:
            raise ValueError(
                f"shot {shot.shot_id}: start_frame ({shot.start_frame}) must be < end_frame ({shot.end_frame})"
            )

    checkpoint = request.checkpoint_path or os.getenv("SAM2_CHECKPOINT", "")
    model_cfg = request.model_config or os.getenv("SAM2_CONFIG", "")

    if not checkpoint or not Path(checkpoint).exists():
        raise FileNotFoundError(
            f"SAM2 checkpoint not found: {checkpoint}. Set SAM2_CHECKPOINT env var."
        )
    if not model_cfg:
        raise ValueError("SAM2_CONFIG is required (set env var or pass model_config)")

    build_module, predictor_module = _require_sam2_video()
    build_sam2 = getattr(build_module, "build_sam2_video_predictor")
    predictor = build_sam2(model_cfg, checkpoint)

    reid = _ReIDEmbedder() if request.enable_reid and HAS_OPEN_CLIP else None
    known_embeddings: dict[int, np.ndarray] = {}

    cap_check = cv2.VideoCapture(request.video_path)
    if not cap_check.isOpened():
        raise ValueError(f"Cannot open video: {request.video_path}")
    src_w = int(cap_check.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap_check.get(cv2.CAP_PROP_FRAME_HEIGHT))
    src_fps = cap_check.get(cv2.CAP_PROP_FPS) or 30.0
    cap_check.release()

    tmp_root = tempfile.mkdtemp(prefix="monet_track_")
    job_id = uuid.uuid4().hex[:12]

    subject_frames: dict[int, list[dict[str, Any]]] = {
        s.subject_id: [] for s in request.subjects
    }

    shot_errors: list[dict[str, Any]] = []

    try:
        for shot in request.shots:
            shot_dir = str(Path(tmp_root) / shot.shot_id)
            Path(shot_dir).mkdir(parents=True, exist_ok=True)
            inference_state = None

            try:
                n_extracted, target_h, fps = _extract_shot_frames(
                    video_path=request.video_path,
                    start_frame=shot.start_frame,
                    end_frame=shot.end_frame,
                    output_dir=shot_dir,
                    step=request.frame_step,
                    target_width=request.working_width,
                    max_frames=request.max_frames_per_shot,
                )

                if n_extracted == 0:
                    shot_errors.append({"shotId": shot.shot_id, "error": "no frames extracted"})
                    continue

                inference_state = predictor.init_state(video_path=shot_dir)

                for subj in request.subjects:
                    seed_frame_in_shot = subj.seed_frame - shot.start_frame
                    seed_frame_idx = round(seed_frame_in_shot / request.frame_step)
                    if seed_frame_idx < 0 or seed_frame_idx >= n_extracted:
                        continue

                    box = _scale_box(subj.seed_box, src_w, src_h, request.working_width, target_h)
                    predictor.add_new_points_or_box(
                        inference_state=inference_state,
                        frame_idx=seed_frame_idx,
                        obj_id=subj.subject_id,
                        box=np.array(box, dtype=np.float32),
                    )

                for frame_idx_in_shot, obj_ids, mask_logits_list in predictor.propagate_in_video(inference_state):
                    video_frame_idx = shot.start_frame + frame_idx_in_shot * request.frame_step
                    timestamp = video_frame_idx / fps

                    for obj_idx, obj_id in enumerate(obj_ids):
                        logit = mask_logits_list[obj_idx]
                        if hasattr(logit, "cpu"):
                            logit_np = logit.cpu().numpy()
                        else:
                            logit_np = np.array(logit)
                        mask = (logit_np > 0.0).astype(np.uint8)
                        if mask.ndim == 3:
                            mask = mask[0]

                        conf = _mask_confidence(logit_np, mask)
                        occluded = conf < 0.3

                        bbox = _mask_to_bbox(mask)
                        rle = _mask_to_rle(mask)

                        if reid and not occluded and conf > 0.5:
                            extracted_path = str(Path(shot_dir) / f"{frame_idx_in_shot + 1:06d}.jpg")
                            frame_bgr = cv2.imread(extracted_path)
                            if frame_bgr is not None:
                                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                                emb = reid.get_embedding(frame_rgb, mask)
                                if emb is not None:
                                    if obj_id in known_embeddings:
                                        alpha = 0.9
                                        known_embeddings[obj_id] = (
                                            alpha * known_embeddings[obj_id] + (1 - alpha) * emb
                                        )
                                        nrm = np.linalg.norm(known_embeddings[obj_id])
                                        if nrm > 0:
                                            known_embeddings[obj_id] /= nrm
                                    else:
                                        known_embeddings[obj_id] = emb

                        if obj_id in subject_frames:
                            subject_frames[obj_id].append({
                                "frameIdx": video_frame_idx,
                                "timestamp": round(timestamp, 3),
                                "bbox": bbox,
                                "maskRle": rle,
                                "confidence": round(conf, 4),
                                "occluded": occluded,
                            })

                predictor.reset_state(inference_state)

            except Exception as exc:
                shot_errors.append({"shotId": shot.shot_id, "error": str(exc)})
                if inference_state is not None:
                    try:
                        predictor.reset_state(inference_state)
                    except Exception:
                        pass
                continue

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    subjects_output = []
    for subj in request.subjects:
        frames = subject_frames.get(subj.subject_id, [])
        subjects_output.append({
            "subjectId": subj.subject_id,
            "label": subj.label,
            "frames": frames,
        })

    return {
        "jobId": job_id,
        "subjects": subjects_output,
        "fps": src_fps,
        "width": request.working_width,
        "height": int(round(src_h * (request.working_width / src_w))) if src_w > 0 else 0,
        "shotErrors": shot_errors,
    }
