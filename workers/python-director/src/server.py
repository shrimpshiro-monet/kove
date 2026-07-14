from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .director import Director

app = FastAPI(title="Kove Director API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    video_path: str = Field(..., min_length=1)
    audio_path: str = Field(..., min_length=1)
    reference_path: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "2.0.0"}


@app.post("/api/generate")
def generate_edl(request: GenerateRequest) -> dict:
    try:
        director = Director()
        edl = director.direct(
            prompt=request.prompt,
            footage_path=request.video_path,
            music_path=request.audio_path,
            reference_path=request.reference_path,
        )
        return edl
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
