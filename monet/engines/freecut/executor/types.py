# monet/engines/freecut/executor/types.py
from __future__ import annotations
from typing import Literal, Optional, Union, List, Dict
from pydantic import BaseModel, Field, ConfigDict


# ---------- Action union ----------

class AddMediaAction(BaseModel):
    type: Literal["addMedia"]
    trackId: str
    mediaId: str
    clipId: str
    startTime: float
    sourceIn: Optional[float] = None
    sourceOut: Optional[float] = None


class SplitAction(BaseModel):
    type: Literal["split"]
    trackId: str
    clipId: str
    time: float  # SOURCE-relative seconds


class UpdateClipProperties(BaseModel):
    playbackSpeed: Optional[float] = None
    volume: Optional[float] = None
    mute: Optional[bool] = None
    model_config = ConfigDict(extra="allow")


class UpdateClipAction(BaseModel):
    type: Literal["updateClip"]
    trackId: str
    clipId: str
    properties: UpdateClipProperties


class CaptionStyle(BaseModel):
    color: Optional[str] = None
    fontSize: Optional[Union[str, float]] = None
    fontFamily: Optional[str] = None
    fontWeight: Optional[Literal["normal", "bold"]] = None
    textAlign: Optional[Literal["left", "center", "right"]] = None
    verticalAlign: Optional[Literal["top", "middle", "bottom"]] = None
    backgroundColor: Optional[str] = None
    strokeColor: Optional[str] = None
    strokeWidth: Optional[float] = None


class AddCaptionAction(BaseModel):
    type: Literal["addCaption"]
    trackId: str
    startTime: float
    duration: float
    text: str
    style: Optional[CaptionStyle] = None


class RemoveClipAction(BaseModel):
    type: Literal["removeClip"]
    trackId: str
    clipId: str


Action = Union[
    AddMediaAction, SplitAction, UpdateClipAction,
    AddCaptionAction, RemoveClipAction,
]


# ---------- Project settings ----------

class ProjectSettings(BaseModel):
    width: int = 1080
    height: int = 1920
    fps: int = 30
    audioSampleRate: int = 44100
    audioChannels: int = 2


# ---------- Resolved Timeline IR ----------

class VideoSegment(BaseModel):
    inputIndex: int
    inputPath: str
    sourceIn: float
    sourceOut: float
    timelineStart: float
    playbackSpeed: float = 1.0
    volume: float = 1.0
    mute: bool = False


class AudioSegment(BaseModel):
    inputIndex: int
    inputPath: str
    sourceIn: float
    sourceOut: float
    timelineStart: float
    volume: float = 1.0


class ResolvedCaptionStyle(BaseModel):
    color: str = "white"
    fontSize: float = 72
    fontFamily: str = "Arial"
    fontWeight: Literal["normal", "bold"] = "bold"
    textAlign: Literal["left", "center", "right"] = "center"
    verticalAlign: Literal["top", "middle", "bottom"] = "middle"
    backgroundColor: Optional[str] = None
    strokeColor: Optional[str] = None
    strokeWidth: float = 0


class CaptionSegment(BaseModel):
    startTime: float
    duration: float
    text: str
    style: ResolvedCaptionStyle


class Timeline(BaseModel):
    settings: ProjectSettings
    duration: float
    videoSegments: List[VideoSegment] = Field(default_factory=list)
    bgmTracks: List[AudioSegment] = Field(default_factory=list)
    captions: List[CaptionSegment] = Field(default_factory=list)


# ---------- Render result ----------

class CoverageReport(BaseModel):
    actionsReceived: int
    actionsApplied: int
    unsupportedActions: List[str] = Field(default_factory=list)
    resolvedMedia: Dict[str, str] = Field(default_factory=dict)
    unresolvedMedia: List[str] = Field(default_factory=list)


class RenderResult(BaseModel):
    outputPath: str
    command: str
    filterGraph: str
    durationSec: float
    coverage: CoverageReport
