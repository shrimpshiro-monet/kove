"""
Editing Grammar DNA Schema
Shared data structure for all analyzers.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
import json

@dataclass
class ShotType:
    """Classification of shot framing."""
    wide: float = 0.0
    medium: float = 0.0
    close: float = 0.0
    extreme_close: float = 0.0
    drone: float = 0.0
    pov: float = 0.0
    over_shoulder: float = 0.0
    macro: float = 0.0
    silhouette: float = 0.0
    
    @property
    def dominant(self) -> str:
        types = {
            "wide": self.wide,
            "medium": self.medium,
            "close": self.close,
            "extreme_close": self.extreme_close,
            "drone": self.drone,
            "pov": self.pov,
            "over_shoulder": self.over_shoulder,
            "macro": self.macro,
            "silhouette": self.silhouette,
        }
        return max(types, key=types.get)

@dataclass
class CameraMotion:
    """Camera movement analysis."""
    static: float = 0.0
    pan: float = 0.0
    tilt: float = 0.0
    dolly: float = 0.0
    handheld: float = 0.0
    zoom: float = 0.0
    tracking: float = 0.0
    orbit: float = 0.0
    
    @property
    def dominant(self) -> str:
        motions = {
            "static": self.static,
            "pan": self.pan,
            "tilt": self.tilt,
            "dolly": self.dolly,
            "handheld": self.handheld,
            "zoom": self.zoom,
            "tracking": self.tracking,
            "orbit": self.orbit,
        }
        return max(motions, key=motions.get)

@dataclass
class SubjectMotion:
    """Subject movement analysis."""
    walking: float = 0.0
    running: float = 0.0
    jumping: float = 0.0
    standing: float = 0.0
    celebrating: float = 0.0
    ball_release: float = 0.0
    dribble: float = 0.0
    falling: float = 0.0
    turning: float = 0.0
    gesturing: float = 0.0

@dataclass
class MotionIntensity:
    """Optical flow based motion analysis."""
    magnitude: float = 0.0  # Average flow magnitude
    peak: float = 0.0  # Peak magnitude
    variance: float = 0.0  # Motion variance
    direction: str = "none"  # dominant direction
    flow_histogram: List[float] = field(default_factory=list)

@dataclass
class SpeedRamp:
    """Per-shot speed analysis."""
    start_speed: float = 1.0
    end_speed: float = 1.0
    avg_speed: float = 1.0
    has_ramp: bool = False
    ramp_points: List[Dict[str, float]] = field(default_factory=list)

@dataclass
class ScaleChange:
    """Digital zoom/scale analysis."""
    start_scale: float = 1.0
    end_scale: float = 1.0
    max_scale: float = 1.0
    has_zoom: bool = False

@dataclass
class EffectDetection:
    """Detected visual effects."""
    blur: float = 0.0
    flash: float = 0.0
    shake: float = 0.0
    glow: float = 0.0
    chromatic_aberration: float = 0.0
    rgb_split: float = 0.0
    directional_blur: float = 0.0
    whip: float = 0.0
    zoom_blur: float = 0.0
    light_leak: float = 0.0
    film_burn: float = 0.0
    vignette: float = 0.0
    grain: float = 0.0

@dataclass
class TextOverlay:
    """Detected text overlay."""
    text: str
    start_time: float
    end_time: float
    font_weight: str  # bold, regular, light
    font_size: str  # small, medium, large, xlarge
    placement: str  # center, top, bottom, left, right
    animation: str  # static, pop, fade, slide, typewriter
    color: str
    shadow: bool = False
    tracking: float = 0.0  # letter spacing

@dataclass
class AudioEvent:
    """Detected audio event."""
    time: float
    event_type: str  # kick, snare, 808, drop, chorus, verse, vocal, silence
    intensity: float
    duration: float = 0.0

@dataclass
class SemanticEvent:
    """AI-detected semantic event."""
    time: float
    duration: float
    description: str
    category: str  # action, reaction, celebration, setup, transition
    emotion: str  # tension, release, excitement, calm
    importance: float  # 0-1

@dataclass
class RhythmAnalysis:
    """Rhythm and timing analysis."""
    cuts_on_beat: float = 0.0  # Percentage
    cuts_off_beat: float = 0.0
    avg_beats_between_cuts: float = 0.0
    rhythm_pattern: List[str] = field(default_factory=list)  # ["beat", "cut", "beat", "cut"]
    tempo_bpm: float = 0.0

@dataclass 
class TransitionAnalysis:
    """Transition detection."""
    cut: int = 0
    fade: int = 0
    fade_black: int = 0
    fade_white: int = 0
    dissolve: int = 0
    wipe: int = 0
    zoom: int = 0
    glitch: int = 0
    whip: int = 0
    morph: int = 0

@dataclass
class ColorAnalysis:
    """Advanced color analysis with k-means clustering."""
    dominant_palette: List[Dict[str, Any]] = field(default_factory=list)  # [{r, g, b, percentage}]
    luminance_histogram: List[float] = field(default_factory=list)
    contrast: float = 0.0
    black_point: float = 0.0
    white_point: float = 0.0
    saturation_histogram: List[float] = field(default_factory=list)
    hue_distribution: Dict[str, float] = field(default_factory=dict)
    skin_tone_range: Dict[str, float] = field(default_factory=dict)
    color_temperature: str = "neutral"  # warm, cool, neutral
    grade: str = "normal"

@dataclass
class ShotDNA:
    """Complete DNA for a single shot."""
    index: int
    start: float
    end: float
    duration: float
    
    # From various analyzers
    shot_type: ShotType = field(default_factory=ShotType)
    camera_motion: CameraMotion = field(default_factory=CameraMotion)
    subject_motion: SubjectMotion = field(default_factory=SubjectMotion)
    motion_intensity: MotionIntensity = field(default_factory=MotionIntensity)
    speed_ramp: SpeedRamp = field(default_factory=SpeedRamp)
    scale_change: ScaleChange = field(default_factory=ScaleChange)
    effects: EffectDetection = field(default_factory=EffectDetection)
    text_overlays: List[TextOverlay] = field(default_factory=list)
    semantic_events: List[SemanticEvent] = field(default_factory=list)
    color: ColorAnalysis = field(default_factory=ColorAnalysis)
    transition_in: str = "cut"
    energy: float = 0.0

@dataclass
class ReferenceDNA:
    """Complete editing grammar DNA for a reference video."""
    name: str
    source: str
    duration: float
    resolution: Dict[str, int] = field(default_factory=dict)
    fps: float = 30.0
    
    # Global analysis
    total_shots: int = 0
    avg_shot_duration: float = 0.0
    cut_rate: float = 0.0
    
    # Shot list
    shots: List[ShotDNA] = field(default_factory=list)
    
    # Global patterns
    rhythm: RhythmAnalysis = field(default_factory=RhythmAnalysis)
    transitions: TransitionAnalysis = field(default_factory=TransitionAnalysis)
    audio_events: List[AudioEvent] = field(default_factory=list)
    semantic_events: List[SemanticEvent] = field(default_factory=list)
    
    # Color profile
    color_profile: ColorAnalysis = field(default_factory=ColorAnalysis)
    
    # Energy curve
    energy_curve: List[Dict[str, float]] = field(default_factory=list)
    
    # Editing grammar rules (extracted patterns)
    grammar_rules: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        from dataclasses import asdict
        return asdict(self)
    
    def save(self, path: str):
        """Save DNA to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, path: str) -> "ReferenceDNA":
        """Load DNA from JSON file."""
        with open(path) as f:
            data = json.load(f)
        # Reconstruct from dict
        return cls(**data)
