from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .director import Director

UPLOAD_DIR = "/tmp/kove-uploads"
progress_store: dict[str, dict] = {}
os.makedirs(UPLOAD_DIR, exist_ok=True)

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


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> dict[str, str]:
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename or "upload")[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return {"path": file_path, "filename": file.filename or f"{file_id}{file_ext}"}


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
        logger.exception("EDL generation failed")
        raise HTTPException(status_code=500, detail="An internal error occurred")


@app.get("/api/progress/{job_id}")
def get_progress(job_id: str) -> dict[str, str]:
    return progress_store.get(job_id, {"status": "not_found"})
