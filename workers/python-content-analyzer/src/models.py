from pydantic import BaseModel
from typing import Optional


class FaceDetection(BaseModel):
    frame: int
    bbox: list[int]
    landmarks: Optional[dict[str, list[int]]] = None
    confidence: float


class ContentAnalysis(BaseModel):
    faces: list[FaceDetection]
    objects: list[dict]
    depth: list[dict]
    motion: list[dict]
    scenes: list[dict]
    brightness: list[float]
    composition: dict
    color_palette: list[dict]
    semantic: str
