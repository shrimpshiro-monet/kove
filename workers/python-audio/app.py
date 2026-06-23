from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from workers.analyze_audio import AudioAnalysisRequest, analyze_audio
from workers.render_audio_vfx import AudioVFXRequest, render_audio_vfx

app = FastAPI(title="Monet Python Audio Worker", version="0.1.0")


class AnalyzeAudioBody(BaseModel):
    filePath: str = Field(min_length=1)
    sampleRate: int = Field(default=22050, ge=8000, le=96000)
    hopLength: int = Field(default=512, ge=64, le=4096)


class RenderAudioVFXBody(BaseModel):
    inputPath: str = Field(min_length=1)
    outputPath: str = Field(min_length=1)
    preset: str = Field(default="viral-master")
    gainDb: float = 0.0


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-audio")
def analyze_audio_route(body: AnalyzeAudioBody) -> dict:
    result = analyze_audio(
        AudioAnalysisRequest(
            file_path=body.filePath,
            sample_rate=body.sampleRate,
            hop_length=body.hopLength,
        )
    )

    return {
        "success": True,
        "data": result,
    }


@app.post("/audio/render-vfx")
def render_audio_vfx_route(body: RenderAudioVFXBody) -> dict:
    result = render_audio_vfx(
        AudioVFXRequest(
            input_path=body.inputPath,
            output_path=body.outputPath,
            preset=body.preset,
            gain_db=body.gainDb,
        )
    )

    return {"success": True, "data": result}
