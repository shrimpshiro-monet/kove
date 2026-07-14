from pydantic import BaseModel


class BeatResult(BaseModel):
    beats: list[float]
    downbeats: list[float]
    bpm: float


class MusicAnalysis(BaseModel):
    bpm: float
    beat_result: BeatResult
    onsets: list[float]
    sections: list[dict]
    energy_curve: list[tuple[float, float]]
    vocal_regions: list[tuple[float, float]]
    frequency_profile: dict[str, float]
