from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

from workers.estimate_depth import EstimateDepthRequest, estimate_depth
from workers.segment_subject import SegmentSubjectRequest, segment_subject
from workers.track_points import TrackPointsRequest, track_points
from workers.track_subject import TrackSubjectRequest, track_subject
from workers.subject_track_mask import (
    ShotSpec,
    SubjectSeed,
    TrackMaskRequest,
    track_mask,
)
from workers.transcribe import TranscribeRequest, transcribe_audio
from workers.deep_analysis import run_deep_analysis
from workers.cut_detector import detect_cuts
from workers.motion_analyzer import analyze_motion
from workers.frame_extractor import extract_frames
from workers.reference_analyzer import analyze_reference

app = FastAPI(title="Monet Python AI Worker", version="0.2.0")


class TranscribeBody(BaseModel):
    filePath: str = Field(min_length=1)
    modelName: Optional[str] = None
    device: Optional[str] = None
    computeType: Optional[str] = None
    language: Optional[str] = None


class TrackSubjectBody(BaseModel):
    filePath: str = Field(min_length=1)
    sampleEveryNFrames: int = Field(default=5, ge=1, le=60)
    maxFrames: int = Field(default=900, ge=1, le=10000)


class SegmentSubjectBody(BaseModel):
    filePath: str = Field(min_length=1)
    clipId: str = Field(min_length=1)
    mediaId: str = Field(min_length=1)
    outputDir: str = Field(default=".monet-artifacts/spatial", min_length=1)
    sampleEveryNFrames: int = Field(default=8, ge=1, le=120)
    maxFrames: int = Field(default=240, ge=1, le=10000)
    checkpointPath: Optional[str] = None
    modelConfig: Optional[str] = None


class EstimateDepthBody(BaseModel):
    filePath: str = Field(min_length=1)
    clipId: str = Field(min_length=1)
    mediaId: str = Field(min_length=1)
    outputDir: str = Field(default=".monet-artifacts/spatial", min_length=1)
    encoder: str = Field(default="vits")
    checkpointPath: Optional[str] = None
    sampleEveryNFrames: int = Field(default=8, ge=1, le=120)
    maxFrames: int = Field(default=240, ge=1, le=10000)


class TrackPointsBody(BaseModel):
    filePath: str = Field(min_length=1)
    clipId: str = Field(min_length=1)
    mediaId: str = Field(min_length=1)
    outputDir: str = Field(default=".monet-artifacts/spatial", min_length=1)
    gridSize: int = Field(default=10, ge=2, le=80)
    maxFrames: int = Field(default=120, ge=2, le=10000)
    checkpointPath: Optional[str] = None
    commercialVerified: bool = False


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
def transcribe_route(body: TranscribeBody) -> dict:
    result = transcribe_audio(
        TranscribeRequest(
            file_path=body.filePath,
            model_name=body.modelName or os.getenv("WHISPER_MODEL", "small"),
            device=body.device or os.getenv("WHISPER_DEVICE", "cpu"),
            compute_type=body.computeType or os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            language=body.language,
        )
    )

    return {"success": True, "data": result}


@app.post("/track-subject")
def track_subject_route(body: TrackSubjectBody) -> dict:
    result = track_subject(
        TrackSubjectRequest(
            file_path=body.filePath,
            sample_every_n_frames=body.sampleEveryNFrames,
            max_frames=body.maxFrames,
        )
    )

    return {"success": True, "data": result}


@app.post("/spatial/segment-subject")
def segment_subject_route(body: SegmentSubjectBody) -> dict:
    result = segment_subject(
        SegmentSubjectRequest(
            file_path=body.filePath,
            clip_id=body.clipId,
            media_id=body.mediaId,
            output_dir=body.outputDir,
            sample_every_n_frames=body.sampleEveryNFrames,
            max_frames=body.maxFrames,
            checkpoint_path=body.checkpointPath,
            model_config=body.modelConfig,
        )
    )

    return {"success": True, "data": result}


@app.post("/spatial/estimate-depth")
def estimate_depth_route(body: EstimateDepthBody) -> dict:
    result = estimate_depth(
        EstimateDepthRequest(
            file_path=body.filePath,
            clip_id=body.clipId,
            media_id=body.mediaId,
            output_dir=body.outputDir,
            encoder=body.encoder,
            checkpoint_path=body.checkpointPath,
            sample_every_n_frames=body.sampleEveryNFrames,
            max_frames=body.maxFrames,
        )
    )

    return {"success": True, "data": result}


@app.post("/spatial/track-points")
def track_points_route(body: TrackPointsBody) -> dict:
    result = track_points(
        TrackPointsRequest(
            file_path=body.filePath,
            clip_id=body.clipId,
            media_id=body.mediaId,
            output_dir=body.outputDir,
            grid_size=body.gridSize,
            max_frames=body.maxFrames,
            checkpoint_path=body.checkpointPath,
            commercial_verified=body.commercialVerified,
        )
    )

    return {"success": True, "data": result}


class ShotSpecBody(BaseModel):
    shotId: str = Field(min_length=1)
    startFrame: int = Field(ge=0)
    endFrame: int = Field(ge=0)


class SubjectSeedBody(BaseModel):
    subjectId: int = Field(ge=0)
    label: str = Field(min_length=1)
    seedFrame: int = Field(ge=0)
    seedBox: list[float] = Field(min_length=4, max_length=4)


class TrackMaskBody(BaseModel):
    filePath: str = Field(min_length=1)
    shots: list[ShotSpecBody] = Field(min_length=1)
    subjects: list[SubjectSeedBody] = Field(min_length=1)
    frameStep: int = Field(default=2, ge=1, le=10)
    maxFramesPerShot: int = Field(default=300, ge=1, le=10000)
    workingWidth: int = Field(default=1280, ge=320, le=3840)
    checkpointPath: Optional[str] = None
    modelConfig: Optional[str] = None
    enableReid: bool = True
    reidThreshold: float = Field(default=0.75, ge=0.0, le=1.0)


class ExtractFramesBody(BaseModel):
    filePath: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0, le=30)
    maxFrames: Optional[int] = Field(default=None, ge=1)
    outputDir: Optional[str] = None


class DeepAnalysisBody(BaseModel):
    filePath: str = Field(min_length=1)
    audioPath: Optional[str] = None


@app.post("/extract-frames")
def extract_frames_route(body: ExtractFramesBody) -> dict:
    result = extract_frames(
        file_path=body.filePath,
        fps=body.fps,
        max_frames=body.maxFrames,
        output_dir=body.outputDir,
    )
    return {
        "success": True,
        "data": {
            "frames": [
                {"path": f.path, "timestamp_s": f.timestamp_s, "width": f.width, "height": f.height}
                for f in result.frames
            ],
            "metadata": result.metadata,
        },
    }


@app.post("/spatial/track-mask")
def track_mask_route(body: TrackMaskBody) -> dict:
    result = track_mask(
        TrackMaskRequest(
            video_path=body.filePath,
            shots=[
                ShotSpec(
                    shot_id=s.shotId,
                    start_frame=s.startFrame,
                    end_frame=s.endFrame,
                )
                for s in body.shots
            ],
            subjects=[
                SubjectSeed(
                    subject_id=s.subjectId,
                    label=s.label,
                    seed_frame=s.seedFrame,
                    seed_box=s.seedBox,
                )
                for s in body.subjects
            ],
            frame_step=body.frameStep,
            max_frames_per_shot=body.maxFramesPerShot,
            working_width=body.workingWidth,
            checkpoint_path=body.checkpointPath,
            model_config=body.modelConfig,
            enable_reid=body.enableReid,
            reid_threshold=body.reidThreshold,
        )
    )
    return {"success": True, "data": result}


class AnalyzeReferenceBody(BaseModel):
    filePath: str = Field(min_length=1)


@app.post("/analyze-reference")
def analyze_reference_route(body: AnalyzeReferenceBody) -> dict:
    result = analyze_reference(body.filePath)
    return {"success": True, "data": result}


class DetectCutsBody(BaseModel):
    frameDir: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0)
    threshold: float = Field(default=0.3, gt=0, lt=1)


@app.post("/detect-cuts")
def detect_cuts_route(body: DetectCutsBody) -> dict:
    result = detect_cuts(
        frame_dir=body.frameDir, fps=body.fps, threshold=body.threshold
    )
    return {"success": True, "data": result}


class AnalyzeMotionBody(BaseModel):
    frameDir: str = Field(min_length=1)
    shots: list[dict] = Field(min_length=1)


@app.post("/analyze-motion")
def analyze_motion_route(body: AnalyzeMotionBody) -> dict:
    result = analyze_motion(frame_dir=body.frameDir, shots=body.shots)
    return {"success": True, "data": result}


@app.post("/deep-analysis")
def deep_analysis_route(body: DeepAnalysisBody) -> dict:
    result = run_deep_analysis(body.filePath, body.audioPath)
    return {"success": True, "data": result}
