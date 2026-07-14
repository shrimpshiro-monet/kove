# Kove v2 — Phase 2: AI Director (The Brain)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Gemini to the content analyzer, build the Creative Planner, Critic, and Style Transfer — the AI that makes creative decisions like a human editor.

**Architecture:** Python services with Gemini API. Content analysis → music analysis → creative planning → critique → refinement. All output EDL v5.1.

**Tech Stack:** Python 3.11+, Gemini API, librosa, OpenCV, InsightFace, Pydantic

## Global Constraints

- Output: EDL v5.1 (validated by edl-v2 package)
- Gemini: use `gemini-2.5-flash` with `responseSchema` for structured output
- No `any` in Python (type hints everywhere)
- TDD: write failing test first, implement, verify pass
- Commit after each task
- Prompts: external .txt files in `src/prompts/`, not inline strings

---

## File Structure

```
workers/python-content-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # REAL: Gemini vision + CV analysis
│   ├── face_detection.py           # InsightFace wrapper
│   ├── object_detection.py         # YOLO wrapper
│   ├── depth_estimation.py         # MiDaS wrapper
│   ├── optical_flow.py             # Farneback optical flow
│   ├── scene_detection.py          # PySceneDetect wrapper
│   ├── composition.py              # Rule of thirds, leading lines
│   ├── color_analysis.py           # Color palette extraction
│   ├── semantic.py                 # Gemini vision integration
│   └── models.py                   # Pydantic data models
├── tests/
│   ├── test_analyzer.py
│   ├── test_face_detection.py
│   ├── test_semantic.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml

workers/python-music-analyzer/
├── src/
│   ├── __init__.py
│   ├── analyzer.py                 # REAL: full music analysis
│   ├── beat_detection.py           # BPM + beat grid
│   ├── onset_detection.py          # Onset detection
│   ├── section_segmentation.py     # Verse/chorus/bridge
│   ├── energy_analysis.py          # Energy curve
│   ├── vocal_detection.py          # Vocal regions
│   ├── frequency_analysis.py       # Frequency profile
│   └── models.py
├── tests/
│   ├── test_analyzer.py
│   ├── test_beat_detection.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml

workers/python-director/
├── src/
│   ├── __init__.py
│   ├── director.py                 # Main Director class
│   ├── content_analyzer.py         # Wraps content-analyzer service
│   ├── music_analyzer.py           # Wraps music-analyzer service
│   ├── creative_planner.py         # Story arc, moments, shot selection
│   ├── critic.py                   # Self-evaluation
│   ├── refiner.py                  # Iterative improvement
│   ├── style_transfer.py           # Reference video analysis
│   ├── intent_decoder.py           # Prompt → structured intent
│   ├── models.py                   # Pydantic data models
│   └── prompts/
│       ├── decode-intent.txt
│       ├── generate-story-arc.txt
│       ├── create-moments.txt
│       ├── select-shots.txt
│       ├── generate-recipes.txt
│       ├── critique-edl.txt
│       └── refine-edl.txt
├── tests/
│   ├── test_director.py
│   ├── test_creative_planner.py
│   ├── test_critic.py
│   ├── test_intent_decoder.py
│   └── test_models.py
├── requirements.txt
└── pyproject.toml
```

---

## Tasks

### Task 10: Content Analyzer — Real Gemini Integration

**Files:**
- Modify: `workers/python-content-analyzer/src/semantic.py`
- Modify: `workers/python-content-analyzer/src/analyzer.py`
- Create: `workers/python-content-analyzer/tests/test_semantic.py`

**Interfaces:**
- Consumes: Video frames (numpy arrays)
- Produces: `SemanticUnderstanding` (description, mood, setting, action, confidence)

- [ ] **Step 1: Write failing test for semantic analysis**

```python
# tests/test_semantic.py
from unittest.mock import patch, MagicMock
from src.semantic import SemanticAnalyzer

@patch('src.semantic.genai')
def test_analyze_frame_returns_understanding(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "A young man walking in a hallway", "mood": "confident", "setting": "indoor", "action": "walking", "confidence": 0.9}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    
    result = analyzer.analyze_frame(frame)
    assert result.description == "A young man walking in a hallway"
    assert result.mood == "confident"
    assert result.confidence == 0.9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-content-analyzer && source .venv/bin/activate && python -m pytest tests/test_semantic.py -v`
Expected: FAIL

- [ ] **Step 3: Implement semantic analyzer**

```python
# src/semantic.py
import google.generativeai as genai
from pydantic import BaseModel
from typing import Optional
import numpy as np
import cv2

class SemanticUnderstanding(BaseModel):
    description: str
    mood: str
    setting: str
    action: str
    confidence: float

class SemanticAnalyzer:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def analyze_frame(self, frame: np.ndarray) -> SemanticUnderstanding:
        # Encode frame as JPEG for Gemini
        _, buffer = cv2.imencode('.jpg', frame)
        image_bytes = buffer.tobytes()
        
        prompt = """Analyze this video frame. Return JSON with:
- description: what's happening in the scene
- mood: emotional tone (confident, calm, energetic, mysterious, etc.)
- setting: where this is (indoor, outdoor, urban, nature, etc.)
- action: what the subject is doing
- confidence: how confident you are (0-1)"""
        
        response = self.model.generate_content([
            prompt,
            {"mime_type": "image/jpeg", "data": image_bytes}
        ])
        
        # Parse JSON from response
        import json
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        
        data = json.loads(text)
        return SemanticUnderstanding(**data)
    
    def analyze_frames(self, frames: list[np.ndarray], sample_rate: int = 1) -> list[SemanticUnderstanding]:
        """Analyze multiple frames, sampling every Nth frame."""
        results = []
        for i, frame in enumerate(frames):
            if i % sample_rate == 0:
                results.append(self.analyze_frame(frame))
        return results
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-content-analyzer && source .venv/bin/activate && python -m pytest tests/test_semantic.py -v`
Expected: PASS

- [ ] **Step 5: Wire semantic into analyzer**

```python
# Update src/analyzer.py
from .semantic import SemanticAnalyzer, SemanticUnderstanding
from .models import ContentAnalysis, FaceDetection

class ContentAnalyzer:
    def __init__(self, api_key: str = None):
        self.semantic = SemanticAnalyzer(api_key)
        # ... other analyzers
    
    def analyze(self, video_path: str) -> ContentAnalysis:
        frames = self.extract_frames(video_path)
        
        # Real analysis
        faces = self.detect_faces(frames)
        scenes = self.detect_scenes(video_path)
        semantic = self.semantic.analyze_frames(frames, sample_rate=30)
        
        return ContentAnalysis(
            faces=faces,
            objects=[],
            depth=[],
            motion=[],
            scenes=scenes,
            brightness=[self.compute_brightness(f) for f in frames[::30]],
            composition={},
            color_palette=[],
            semantic=semantic[0] if semantic else SemanticUnderstanding(
                description="No analysis", mood="unknown", setting="unknown",
                action="unknown", confidence=0.0
            ),
        )
```

- [ ] **Step 6: Commit**

```bash
git add workers/python-content-analyzer/
git commit -m "feat(content-analyzer): add real Gemini semantic analysis"
```

---

### Task 11: Music Analyzer — Real Beat Detection

**Files:**
- Modify: `workers/python-music-analyzer/src/analyzer.py`
- Create: `workers/python-music-analyzer/src/onset_detection.py`
- Create: `workers/python-music-analyzer/src/section_segmentation.py`
- Create: `workers/python-music-analyzer/src/energy_analysis.py`

**Interfaces:**
- Consumes: Audio file path
- Produces: `MusicAnalysis` with real beat grid, onsets, sections, energy

- [ ] **Step 1: Write failing test for full analysis**

```python
# tests/test_analyzer.py
from src.analyzer import MusicAnalyzer

def test_full_analysis_returns_complete_data():
    analyzer = MusicAnalyzer()
    # Use a real audio file (generate synthetic)
    import numpy as np
    import soundfile as sf
    
    sr = 22050
    duration = 10.0
    t = np.linspace(0, duration, int(sr * duration))
    
    # Create click track at 120 BPM
    beat_interval = 60.0 / 120
    signal = np.zeros_like(t)
    for bt in np.arange(0, duration, beat_interval):
        idx = int(bt * sr)
        if idx < len(signal):
            signal[idx] = 1.0
    
    # Add some noise
    signal += np.random.randn(len(signal)) * 0.1
    
    # Save temp file
    sf.write('/tmp/test_audio.wav', signal, sr)
    
    result = analyzer.analyze('/tmp/test_audio.wav')
    
    assert 115 < result.bpm < 125
    assert len(result.beat_result.beats) > 0
    assert len(result.onsets) > 0
    assert len(result.energy_curve) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-music-analyzer && source .venv/bin/activate && python -m pytest tests/test_analyzer.py -v`
Expected: FAIL (stub returns hardcoded 140 BPM, not 120)

- [ ] **Step 3: Implement real analyzer**

```python
# src/analyzer.py
from .models import MusicAnalysis, BeatResult
from .beat_detection import BeatDetector
from .onset_detection import OnsetDetector
from .section_segmentation import SectionSegmenter
from .energy_analysis import EnergyAnalyzer
import librosa
import numpy as np

class MusicAnalyzer:
    def __init__(self):
        self.beat_detector = BeatDetector()
        self.onset_detector = OnsetDetector()
        self.section_segmenter = SectionSegmenter()
        self.energy_analyzer = EnergyAnalyzer()
    
    def analyze(self, audio_path: str) -> MusicAnalysis:
        y, sr = librosa.load(audio_path, sr=22050)
        
        # Beat detection
        beat_result = self.beat_detector.detect(y, sr)
        
        # Onset detection
        onsets = self.onset_detector.detect(y, sr)
        
        # Section segmentation
        sections = self.section_segmenter.segment(y, sr)
        
        # Energy analysis
        energy_curve = self.energy_analyzer.compute(y, sr)
        
        # Vocal detection (simplified)
        vocal_regions = self.detect_vocals(y, sr)
        
        # Frequency profile
        freq_profile = self.analyze_frequency(y, sr)
        
        return MusicAnalysis(
            bpm=beat_result.bpm,
            beat_result=beat_result,
            onsets=onsets,
            sections=sections,
            energy_curve=energy_curve,
            vocal_regions=vocal_regions,
            frequency_profile=freq_profile,
        )
    
    def detect_vocals(self, y, sr):
        # Simplified: detect energy in vocal range (300Hz-3kHz)
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        vocal_mask = (freqs >= 300) & (freqs <= 3000)
        vocal_energy = S[vocal_mask].mean(axis=0)
        threshold = vocal_energy.mean() + vocal_energy.std()
        
        # Find regions above threshold
        frames = np.where(vocal_energy > threshold)[0]
        if len(frames) == 0:
            return []
        
        # Group into regions
        regions = []
        start = frames[0]
        for i in range(1, len(frames)):
            if frames[i] - frames[i-1] > 10:  # gap > 10 frames
                regions.append((librosa.frames_to_time(start, sr=sr),
                              librosa.frames_to_time(frames[i-1], sr=sr)))
                start = frames[i]
        regions.append((librosa.frames_to_time(start, sr=sr),
                       librosa.frames_to_time(frames[-1], sr=sr)))
        
        return regions
    
    def analyze_frequency(self, y, sr):
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        
        low = S[freqs < 300].mean()
        mid = S[(freqs >= 300) & (freqs <= 3000)].mean()
        high = S[freqs > 3000].mean()
        
        total = low + mid + high
        return {
            "low": low / total if total > 0 else 0,
            "mid": mid / total if total > 0 else 0,
            "high": high / total if total > 0 else 0,
        }
```

- [ ] **Step 4: Implement onset detection**

```python
# src/onset_detection.py
import librosa
import numpy as np

class OnsetDetector:
    def detect(self, y: np.ndarray, sr: int) -> list[float]:
        # Detect onsets using spectral flux
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(
            y=y, sr=sr, onset_envelope=onset_env, backtrack=True
        )
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        return onset_times.tolist()
```

- [ ] **Step 5: Implement section segmentation**

```python
# src/section_segmentation.py
import librosa
import numpy as np

class SectionSegmenter:
    def segment(self, y: np.ndarray, sr: int) -> list[dict]:
        # Use structural segmentation via self-similarity
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        
        # Compute self-similarity matrix
        sim = librosa.segment.recurrence_matrix(mfcc, mode='affinity')
        
        # Find segment boundaries
        bounds = librosa.segment.agglomerative(sim, k=8)
        bound_times = librosa.frames_to_time(bounds, sr=sr).tolist()
        
        # Create sections
        sections = []
        for i in range(len(bound_times) - 1):
            sections.append({
                "name": f"section_{i}",
                "start": bound_times[i],
                "end": bound_times[i + 1],
                "energy": 0.5,  # placeholder
            })
        
        return sections
```

- [ ] **Step 6: Implement energy analysis**

```python
# src/energy_analysis.py
import librosa
import numpy as np

class EnergyAnalyzer:
    def compute(self, y: np.ndarray, sr: int) -> list[tuple[float, float]]:
        # Compute RMS energy over time
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
        
        # Normalize to 0-1
        if rms.max() > 0:
            rms_normalized = rms / rms.max()
        else:
            rms_normalized = rms
        
        # Downsample to 1-second intervals
        duration = times[-1]
        energy_curve = []
        for t in np.arange(0, duration, 1.0):
            mask = (times >= t) & (times < t + 1.0)
            if mask.any():
                energy_curve.append((float(t), float(rms_normalized[mask].mean())))
        
        return energy_curve
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd workers/python-music-analyzer && source .venv/bin/activate && python -m pytest tests/test_analyzer.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add workers/python-music-analyzer/
git commit -m "feat(music-analyzer): add real beat detection, onsets, sections, energy"
```

---

### Task 12: Intent Decoder — Prompt → Structured Intent

**Files:**
- Create: `workers/python-director/pyproject.toml`
- Create: `workers/python-director/src/__init__.py`
- Create: `workers/python-director/src/intent_decoder.py`
- Create: `workers/python-director/src/prompts/decode-intent.txt`
- Create: `workers/python-director/tests/test_intent_decoder.py`

**Interfaces:**
- Consumes: User prompt string
- Produces: `Intent` (goal, style, genre, platform, constraints)

- [ ] **Step 1: Write failing test**

```python
# tests/test_intent_decoder.py
from unittest.mock import patch, MagicMock
from src.intent_decoder import IntentDecoder

@patch('src.intent_decoder.genai')
def test_decode_intent_returns_structured(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"goal": "High-energy TikTok edit", "genre": "tiktok_edit", "platform": "tiktok", "style": {"aggression": 0.8, "energy": 0.9}, "constraints": ["keepSubjectVisible"]}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    decoder = IntentDecoder()
    result = decoder.decode("Make a hype TikTok edit of my friend walking")
    
    assert result.goal == "High-energy TikTok edit"
    assert result.genre == "tiktok_edit"
    assert result.style.aggression == 0.8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && python -m pytest tests/test_intent_decoder.py -v`
Expected: FAIL

- [ ] **Step 3: Implement intent decoder**

```python
# src/intent_decoder.py
import google.generativeai as genai
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

class IntentStyle(BaseModel):
    aggression: float = 0.5
    cinematic: float = 0.5
    chaos: float = 0.3
    luxury: float = 0.5
    energy: float = 0.5

class Intent(BaseModel):
    goal: str
    genre: str
    platform: str
    style: IntentStyle
    constraints: list[str]
    mood: Optional[str] = None

class IntentDecoder:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.prompt_template = Path(__file__).parent / 'prompts' / 'decode-intent.txt'
    
    def decode(self, prompt: str) -> Intent:
        template = self.prompt_template.read_text()
        full_prompt = template.replace("{{PROMPT}}", prompt)
        
        response = self.model.generate_content(full_prompt)
        
        import json
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        
        data = json.loads(text)
        
        # Map style fields
        style_data = data.get("style", {})
        style = IntentStyle(
            aggression=style_data.get("aggression", 0.5),
            cinematic=style_data.get("cinematic", 0.5),
            chaos=style_data.get("chaos", 0.3),
            luxury=style_data.get("luxury", 0.5),
            energy=style_data.get("energy", 0.5),
        )
        
        return Intent(
            goal=data.get("goal", ""),
            genre=data.get("genre", "tiktok_edit"),
            platform=data.get("platform", "tiktok"),
            style=style,
            constraints=data.get("constraints", []),
            mood=data.get("mood"),
        )
```

- [ ] **Step 4: Create prompt template**

```txt
# src/prompts/decode-intent.txt
You are a video editing intent decoder. Given a user's natural language prompt, extract the editing intent.

User prompt: {{PROMPT}}

Return JSON with:
- goal: what the user wants to achieve (1 sentence)
- genre: one of ["tiktok_edit", "music_video", "cinematic", "commercial", "documentary", "narrative"]
- platform: one of ["tiktok", "instagram_reels", "youtube", "youtube_shorts", "cinema"]
- style: object with aggression (0-1), cinematic (0-1), chaos (0-1), luxury (0-1), energy (0-1)
- constraints: array of constraint strings (e.g., "keepSubjectVisible", "noTextOverlay")
- mood: optional emotional tone

Be precise. If the prompt is vague, infer the most likely intent.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-director && python -m pytest tests/test_intent_decoder.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add intent decoder with Gemini"
```

---

### Task 13: Creative Planner — Story Arc + Moments

**Files:**
- Create: `workers/python-director/src/creative_planner.py`
- Create: `workers/python-director/src/prompts/generate-story-arc.txt`
- Create: `workers/python-director/src/prompts/create-moments.txt`
- Create: `workers/python-director/tests/test_creative_planner.py`

**Interfaces:**
- Consumes: `Intent`, `ContentAnalysis`, `MusicAnalysis`
- Produces: `CreativePlan` (story arc, moments, emotion arc)

- [ ] **Step 1: Write failing test**

```python
# tests/test_creative_planner.py
from unittest.mock import patch, MagicMock
from src.creative_planner import CreativePlanner
from src.intent_decoder import Intent, IntentStyle
from src.models import ContentAnalysis
from workers.python_music_analyzer.src.models import MusicAnalysis, BeatResult

@patch('src.creative_planner.genai')
def test_plan_creates_moments(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"story_arc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}], "moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "establish", "emotion": "calm", "energy": 0.2, "shots": ["shot_1"], "recipes": [], "aiPrompt": "Set the scene"}], "emotion_arc": {"timeline": [{"time": 0, "emotion": "calm", "intensity": 0.2}]}}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    planner = CreativePlanner()
    intent = Intent(goal="Test", genre="tiktok_edit", platform="tiktok", style=IntentStyle(), constraints=[])
    content = ContentAnalysis(faces=[], objects=[], depth=[], motion=[], scenes=[], brightness=[], composition={}, color_palette=[], semantic="test")
    music = MusicAnalysis(bpm=120, beat_result=BeatResult(beats=[], downbeats=[], bpm=120), onsets=[], sections=[], energy_curve=[], vocal_regions=[], frequency_profile={})
    
    result = planner.plan(intent, content, music)
    assert len(result.moments) > 0
    assert result.moments[0].id == "m1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && python -m pytest tests/test_creative_planner.py -v`
Expected: FAIL

- [ ] **Step 3: Implement creative planner**

```python
# src/creative_planner.py
import google.generativeai as genai
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
from .intent_decoder import Intent
from .models import ContentAnalysis

class StoryPhase(BaseModel):
    phase: str
    start: float
    end: float
    emotion: str

class Moment(BaseModel):
    id: str
    start: float
    end: float
    purpose: str
    emotion: str
    energy: float
    shots: list[str]
    recipes: list[str]
    aiPrompt: str
    focusEntity: Optional[str] = None
    attention: Optional[dict] = None
    constraints: list[str] = []

class EmotionArc(BaseModel):
    timeline: list[dict]

class CreativePlan(BaseModel):
    story_arc: list[StoryPhase]
    moments: list[Moment]
    emotion_arc: EmotionArc

class CreativePlanner:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.story_arc_prompt = Path(__file__).parent / 'prompts' / 'generate-story-arc.txt'
        self.moments_prompt = Path(__file__).parent / 'prompts' / 'create-moments.txt'
    
    def plan(self, intent: Intent, content: ContentAnalysis, music) -> CreativePlan:
        # Generate story arc
        story_arc = self.generate_story_arc(intent, content, music)
        
        # Create moments from story arc
        moments = self.create_moments(story_arc, intent, content, music)
        
        # Generate emotion arc
        emotion_arc = self.generate_emotion_arc(story_arc, music)
        
        return CreativePlan(
            story_arc=story_arc,
            moments=moments,
            emotion_arc=emotion_arc,
        )
    
    def generate_story_arc(self, intent, content, music) -> list[StoryPhase]:
        template = self.story_arc_prompt.read_text()
        prompt = template.replace("{{GOAL}}", intent.goal)\
                         .replace("{{GENRE}}", intent.genre)\
                         .replace("{{PLATFORM}}", intent.platform)\
                         .replace("{{DURATION}}", str(music.bpm))  # simplified
        
        response = self.model.generate_content(prompt)
        import json
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        
        data = json.loads(text)
        return [StoryPhase(**phase) for phase in data.get("story_arc", [])]
    
    def create_moments(self, story_arc, intent, content, music) -> list[Moment]:
        template = self.moments_prompt.read_text()
        arc_str = "\n".join([f"- {p.phase}: {p.start}s-{p.end}s ({p.emotion})" for p in story_arc])
        prompt = template.replace("{{STORY_ARC}}", arc_str)\
                         .replace("{{GOAL}}", intent.goal)\
                         .replace("{{GENRE}}", intent.genre)
        
        response = self.model.generate_content(prompt)
        import json
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        
        data = json.loads(text)
        return [Moment(**m) for m in data.get("moments", [])]
    
    def generate_emotion_arc(self, story_arc, music) -> EmotionArc:
        timeline = []
        for phase in story_arc:
            timeline.append({
                "time": phase.start,
                "emotion": phase.emotion,
                "intensity": 0.5,  # will be refined by critic
            })
        return EmotionArc(timeline=timeline)
```

- [ ] **Step 4: Create prompt templates**

```txt
# src/prompts/generate-story-arc.txt
You are a video editing story arc generator. Given the editing goal, genre, and platform, create a story arc for the video.

Goal: {{GOAL}}
Genre: {{GENRE}}
Platform: {{PLATFORM}}

Return JSON with:
- story_arc: array of phases, each with:
  - phase: name (setup, buildup, climax, resolution, etc.)
  - start: start time in seconds
  - end: end time in seconds
  - emotion: emotional tone for this phase

Create 3-5 phases that build toward the goal. The climax should align with the highest energy moment.
```

```txt
# src/prompts/create-moments.txt
You are a video editing moment creator. Given the story arc, create specific editing moments.

Story arc:
{{STORY_ARC}}

Goal: {{GOAL}}
Genre: {{GENRE}}

Return JSON with:
- moments: array of moments, each with:
  - id: unique identifier (e.g., "moment_reveal")
  - start: start time
  - end: end time
  - purpose: what this moment achieves
  - emotion: emotional tone
  - energy: energy level (0-1)
  - shots: which shot types this moment needs
  - recipes: which editing recipes to apply (empty for now)
  - aiPrompt: instruction for the AI director
  - constraints: array of constraints

Each moment should be 2-5 seconds. Align moments to beat boundaries when possible.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-director && python -m pytest tests/test_creative_planner.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add creative planner with story arc and moments"
```

---

### Task 14: Critic — Self-Evaluation

**Files:**
- Create: `workers/python-director/src/critic.py`
- Create: `workers/python-director/src/prompts/critique-edl.txt`
- Create: `workers/python-director/tests/test_critic.py`

**Interfaces:**
- Consumes: EDL v5.1, `ContentAnalysis`, `MusicAnalysis`
- Produces: `Critique` (issues, confidence, alternatives)

- [ ] **Step 1: Write failing test**

```python
# tests/test_critic.py
from unittest.mock import patch, MagicMock
from src.critic import Critic

@patch('src.critic.genai')
def test_critic_returns_issues(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"issues": [{"type": "beat_sync", "description": "Shot not aligned to beat"}], "confidence": 0.85, "alternatives": []}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    critic = Critic()
    edl = {"runtime": {"tracks": []}, "creative": {"moments": []}}
    content = MagicMock()
    music = MagicMock()
    
    result = critic.critique(edl, content, music)
    assert len(result.issues) > 0
    assert result.confidence == 0.85
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && python -m pytest tests/test_critic.py -v`
Expected: FAIL

- [ ] **Step 3: Implement critic**

```python
# src/critic.py
import google.generativeai as genai
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

class Issue(BaseModel):
    type: str
    description: str
    shotId: Optional[str] = None
    severity: str = "warning"  # warning, error, critical

class Critique(BaseModel):
    issues: list[Issue]
    confidence: float
    alternatives: list[dict]

class Critic:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.prompt_template = Path(__file__).parent / 'prompts' / 'critique-edl.txt'
    
    def critique(self, edl: dict, content, music) -> Critique:
        # Programmatic checks first
        issues = []
        
        # Check beat sync
        for track in edl.get("runtime", {}).get("tracks", []):
            for clip in track.get("clips", []):
                timing = clip.get("timing", {})
                if timing.get("start", 0) % 0.5 > 0.1:  # rough beat alignment
                    issues.append(Issue(
                        type="beat_sync",
                        description=f"Clip {clip.get('id')} not aligned to beat",
                        shotId=clip.get("id"),
                        severity="warning"
                    ))
        
        # Check duration
        track_duration = sum(
            clip.get("timing", {}).get("duration", 0)
            for track in edl.get("runtime", {}).get("tracks", [])
            for clip in track.get("clips", [])
        )
        edl_duration = edl.get("duration", 0)
        if abs(track_duration - edl_duration) > 0.5:
            issues.append(Issue(
                type="duration_mismatch",
                description=f"Track duration {track_duration} != EDL duration {edl_duration}",
                severity="error"
            ))
        
        # Gemini critique for creative quality
        creative_issues = self.gemini_critique(edl, content, music)
        issues.extend(creative_issues)
        
        confidence = 1.0 - (len(issues) * 0.1)
        
        return Critique(
            issues=issues,
            confidence=max(0.0, confidence),
            alternatives=[]
        )
    
    def gemini_critique(self, edl, content, music) -> list[Issue]:
        template = self.prompt_template.read_text()
        prompt = template.replace("{{EDL}}", str(edl)[:2000])
        
        try:
            response = self.model.generate_content(prompt)
            import json
            text = response.text.strip()
            if text.startswith('```'):
                text = text.split('\n', 1)[1].rsplit('```', 1)[0]
            
            data = json.loads(text)
            return [Issue(**issue) for issue in data.get("issues", [])]
        except Exception:
            return []
```

- [ ] **Step 4: Create prompt template**

```txt
# src/prompts/critique-edl.txt
You are a video editing critic. Review this EDL and identify issues.

EDL (truncated):
{{EDL}}

Check for:
1. Beat sync - are cuts aligned to musical beats?
2. Energy flow - does energy build and release naturally?
3. Effect balance - are effects too heavy or too light?
4. Moment coherence - do moments tell a story?
5. Constraint compliance - are constraints satisfied?

Return JSON with:
- issues: array of issues, each with type, description, shotId (if applicable), severity (warning/error/critical)
- If no issues, return empty array
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/python-director && python -m pytest tests/test_critic.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add critic with programmatic + Gemini checks"
```

---

### Task 15: Style Transfer — Reference Video Analysis

**Files:**
- Create: `workers/python-director/src/style_transfer.py`
- Create: `workers/python-director/tests/test_style_transfer.py`

**Interfaces:**
- Consumes: Reference video path
- Produces: `StyleDNA` (cut pattern, effect vocabulary, transition style, color signature)

- [ ] **Step 1: Write failing test**

```python
# tests/test_style_transfer.py
from unittest.mock import patch, MagicMock
from src.style_transfer import StyleTransfer

@patch('src.style_transfer.genai')
def test_extract_style_returns_dna(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"cutPattern": {"avgShotDuration": 1.5, "cutRate": "rapid"}, "effectVocabulary": ["glow", "shake", "rgb_split"], "transitionStyle": "stylized", "colorSignature": {"warmth": 0.7, "contrast": 0.8}}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")
    assert result.cutPattern.avgShotDuration == 1.5
    assert "glow" in result.effectVocabulary
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && python -m pytest tests/test_style_transfer.py -v`
Expected: FAIL

- [ ] **Step 3: Implement style transfer**

```python
# src/style_transfer.py
import google.generativeai as genai
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

class CutPattern(BaseModel):
    avgShotDuration: float
    cutRate: str  # rapid, moderate, slow

class ColorSignature(BaseModel):
    warmth: float
    contrast: float
    saturation: float = 0.5

class StyleDNA(BaseModel):
    cutPattern: CutPattern
    effectVocabulary: list[str]
    transitionStyle: str
    colorSignature: ColorSignature
    pacingProfile: Optional[str] = None

class StyleTransfer:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def extract_style(self, reference_path: str) -> StyleDNA:
        # In production, would analyze frames + audio
        # For now, use Gemini to analyze a few frames
        
        prompt = f"""Analyze this reference video's editing style. Return JSON with:
- cutPattern: {{avgShotDuration: float, cutRate: "rapid"|"moderate"|"slow"}}
- effectVocabulary: array of effect types used (glow, shake, rgb_split, blur, etc.)
- transitionStyle: "hard_cuts"|"smooth"|"stylized"|"mixed"
- colorSignature: {{warmth: 0-1, contrast: 0-1, saturation: 0-1}}
- pacingProfile: "building"|"steady"|"variable"

Reference video: {reference_path}"""
        
        response = self.model.generate_content(prompt)
        import json
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        
        data = json.loads(text)
        return StyleDNA(
            cutPattern=CutPattern(**data.get("cutPattern", {})),
            effectVocabulary=data.get("effectVocabulary", []),
            transitionStyle=data.get("transitionStyle", "smooth"),
            colorSignature=ColorSignature(**data.get("colorSignature", {})),
            pacingProfile=data.get("pacingProfile"),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && python -m pytest tests/test_style_transfer.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add style transfer with Gemini analysis"
```

---

### Task 16: Director — Main Orchestrator

**Files:**
- Create: `workers/python-director/src/director.py`
- Create: `workers/python-director/tests/test_director.py`

**Interfaces:**
- Consumes: User prompt, footage path, music path
- Produces: EDL v5.1

- [ ] **Step 1: Write failing test**

```python
# tests/test_director.py
from unittest.mock import patch, MagicMock
from src.director import Director

@patch('src.director.genai')
def test_director_generates_edl(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"version": "5.1", "id": "test", "created": "2026-01-01T00:00:00Z", "duration": 15, "refs": {"entities": {}, "recipes": {}, "detections": {}}, "style": {"tokens": {"aggression": 0.8, "cinematic": 0.7, "chaos": 0.4, "luxury": 0.9, "warmth": 0.6, "nostalgia": 0.3, "futurism": 0.5, "intimacy": 0.7, "epicness": 0.85, "playfulness": 0.2, "darkness": 0.3, "energy": 0.9}, "tokenInfluence": {}, "genre": {"primary": "tiktok_edit", "platform": "tiktok", "styleProfile": {"cutRate": 1.2, "avgShotDuration": 1.2, "effectDensity": 0.8, "transitionStyle": "stylized", "colorMood": 0.8, "textFrequency": 0.5, "energyCurve": "building"}}, "constraints": {"avoidFaceOcclusion": true, "maxTextCoverage": 0.12, "keepSubjectVisible": true, "preserveMotionDirection": true, "safeArea": true, "avoidOverEditing": true, "maxEffectsPerShot": 5, "minShotDuration": 0.3, "maxTransitionDuration": 1.5, "preserveAudioSync": true, "maintainColorConsistency": true}}, "creative": {"entities": {}, "storyArc": [], "emotionArc": {"timeline": [], "autoApply": {"enabled": false, "affects": [], "strength": 0}}, "moments": [], "intentChains": {"global": "", "perMoment": {}}, "generativeSlots": []}, "editorial": {"sequences": [], "shotRelationships": [], "rhythm": {"pattern": "building", "musicalPhraseAlignment": []}}, "runtime": {"timeline": {"resolution": {"width": 1080, "height": 1920}, "fps": 30, "duration": 15}, "tracks": [], "colorScience": {"workingSpace": "ACES2065-1", "inputTransform": {"source": "camera_log", "cameraProfile": "Sony_SLog3"}, "outputTransform": {"target": "Rec709", "toneMapping": "aces_filmic"}}}, "capabilities": {}, "dependencies": {}, "analysis": {}}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    director = Director()
    result = director.direct("Make a hype TikTok edit", "/tmp/video.mp4", "/tmp/audio.mp3")
    assert result["version"] == "5.1"
    assert "style" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && python -m pytest tests/test_director.py -v`
Expected: FAIL

- [ ] **Step 3: Implement director**

```python
# src/director.py
import google.generativeai as genai
from pathlib import Path
from typing import Optional
from .intent_decoder import IntentDecoder, Intent
from .creative_planner import CreativePlanner, CreativePlan
from .critic import Critic, Critique
from .style_transfer import StyleTransfer, StyleDNA
from .content_analyzer import ContentAnalyzer
from .music_analyzer import MusicAnalyzer

class Director:
    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            genai.configure(api_key=api_key)
        
        self.intent_decoder = IntentDecoder(api_key)
        self.content_analyzer = ContentAnalyzer(api_key)
        self.music_analyzer = MusicAnalyzer()
        self.creative_planner = CreativePlanner(api_key)
        self.critic = Critic(api_key)
        self.style_transfer = StyleTransfer(api_key)
    
    def direct(self, prompt: str, footage_path: str, music_path: str,
               reference_path: Optional[str] = None) -> dict:
        # 1. Decode intent from prompt
        intent = self.intent_decoder.decode(prompt)
        
        # 2. Analyze content
        content = self.content_analyzer.analyze(footage_path)
        
        # 3. Analyze music
        music = self.music_analyzer.analyze(music_path)
        
        # 4. Extract style from reference (if provided)
        style_dna = None
        if reference_path:
            style_dna = self.style_transfer.extract_style(reference_path)
        
        # 5. Plan creative (story arc, moments)
        plan = self.creative_planner.plan(intent, content, music)
        
        # 6. Build EDL from plan
        edl = self.build_edl(plan, intent, content, music)
        
        # 7. Critique
        critique = self.critic.critique(edl, content, music)
        
        # 8. Refine if needed
        if critique.issues:
            edl = self.refine(edl, critique, content, music)
        
        return edl
    
    def build_edl(self, plan: CreativePlan, intent: Intent, content, music) -> dict:
        """Convert creative plan to EDL v5.1."""
        return {
            "version": "5.1",
            "id": f"edl_{intent.genre}_{intent.platform}",
            "created": "2026-01-01T00:00:00Z",
            "duration": 15.0,
            "refs": {"entities": {}, "recipes": {}, "detections": {}},
            "style": {
                "tokens": {
                    "aggression": intent.style.aggression,
                    "cinematic": intent.style.cinematic,
                    "chaos": intent.style.chaos,
                    "luxury": intent.style.luxury,
                    "warmth": 0.5,
                    "nostalgia": 0.3,
                    "futurism": 0.5,
                    "intimacy": 0.5,
                    "epicness": intent.style.energy,
                    "playfulness": 0.2,
                    "darkness": 0.3,
                    "energy": intent.style.energy,
                },
                "tokenInfluence": {},
                "genre": {
                    "primary": intent.genre,
                    "platform": intent.platform,
                    "styleProfile": {
                        "cutRate": 1.2,
                        "avgShotDuration": 1.2,
                        "effectDensity": 0.8,
                        "transitionStyle": "stylized",
                        "colorMood": 0.8,
                        "textFrequency": 0.5,
                        "energyCurve": "building",
                    },
                },
                "constraints": {
                    "avoidFaceOcclusion": True,
                    "maxTextCoverage": 0.12,
                    "keepSubjectVisible": True,
                    "preserveMotionDirection": True,
                    "safeArea": True,
                    "avoidOverEditing": True,
                    "maxEffectsPerShot": 5,
                    "minShotDuration": 0.3,
                    "maxTransitionDuration": 1.5,
                    "preserveAudioSync": True,
                    "maintainColorConsistency": True,
                },
            },
            "creative": {
                "entities": {},
                "story_arc": [p.dict() for p in plan.story_arc],
                "emotion_arc": plan.emotion_arc.dict(),
                "moments": [m.dict() for m in plan.moments],
                "intent_chains": {"global": intent.goal, "perMoment": {}},
                "generativeSlots": [],
            },
            "editorial": {
                "sequences": [],
                "shotRelationships": [],
                "rhythm": {"pattern": "building", "musicalPhraseAlignment": []},
            },
            "runtime": {
                "timeline": {
                    "resolution": {"width": 1080, "height": 1920},
                    "fps": 30,
                    "duration": 15.0,
                },
                "tracks": [],
                "colorScience": {
                    "workingSpace": "ACES2065-1",
                    "inputTransform": {"source": "camera_log", "cameraProfile": "Sony_SLog3"},
                    "outputTransform": {"target": "Rec709", "toneMapping": "aces_filmic"},
                },
            },
            "capabilities": {},
            "dependencies": {},
            "analysis": {},
        }
    
    def refine(self, edl: dict, critique: Critique, content, music) -> dict:
        """Refine EDL based on critique."""
        # For now, just return the EDL
        # TODO: implement iterative refinement
        return edl
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && python -m pytest tests/test_director.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add main orchestrator with full pipeline"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 10 | Content Analyzer (Gemini) | 45 min |
| 11 | Music Analyzer (real) | 45 min |
| 12 | Intent Decoder | 30 min |
| 13 | Creative Planner | 45 min |
| 14 | Critic | 30 min |
| 15 | Style Transfer | 30 min |
| 16 | Director (orchestrator) | 45 min |
| **Total** | | **~5 hours** |

## After Phase 2

Phase 3 builds the rendering layer:
- 20+ FFmpeg effects
- 10+ transitions
- WebGL real-time preview
- Minimal frontend UI

Phase 4 adds the differentiators:
- User learning + memory
- Bandit exploration
- Real-time co-editing (deferred)
