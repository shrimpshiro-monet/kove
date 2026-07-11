# sidecar/media-sidecar.py
# FastAPI sidecar for media extraction: frames, beat onsets, motion energy, cut detection.
# Deploy as a separate service (Fly.io, Railway, Cloudflare Container, etc.).

import io, base64, tempfile, os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import boto3
import librosa
import numpy as np
import cv2

app = FastAPI()

# R2 client (S3-compatible)
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "monet-media-dev")

if R2_ENDPOINT and R2_ACCESS_KEY:
    R2 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
    )
else:
    R2 = None


def download_file(file_id: str) -> str:
    """Download from R2 to a temp file. Returns local path."""
    if not R2:
        raise HTTPException(500, "R2 not configured")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
    R2.download_fileobj(R2_BUCKET, file_id, tmp)
    tmp.close()
    return tmp.name


class FramesReq(BaseModel):
    fileId: str
    count: int = 8


@app.post("/extract-frames")
def extract_frames(req: FramesReq):
    path = download_file(req.fileId)
    try:
        cap = cv2.VideoCapture(path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total == 0:
            raise HTTPException(400, "No frames in video")

        indices = np.linspace(0, total - 1, req.count, dtype=int)
        frames_b64 = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            scale = 768 / max(h, w)
            if scale < 1:
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                continue
            frames_b64.append(base64.b64encode(buf).decode())

        cap.release()
        return {"frames": frames_b64}
    finally:
        os.unlink(path)


class AudioReq(BaseModel):
    fileId: str


@app.post("/extract-audio-features")
def extract_audio_features(req: AudioReq):
    path = download_file(req.fileId)
    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Real onset detection — not BPM math
        onset_frames = librosa.onset.onset_detect(
            y=y, sr=sr, units="frames", backtrack=True
        )
        onsets = librosa.frames_to_time(onset_frames, sr=sr).tolist()

        # BPM + beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        if hasattr(tempo, "__len__"):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)
        beat_grid = librosa.frames_to_time(beat_frames, sr=sr).tolist()

        # Energy envelope (RMS) downsampled
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
        target_len = min(200, len(rms))
        energy_envelope = np.interp(
            np.linspace(0, len(rms) - 1, target_len),
            np.arange(len(rms)),
            rms,
        ).tolist()

        return {
            "bpm": tempo,
            "duration": duration,
            "onsets": onsets,
            "beatGrid": beat_grid,
            "energyEnvelope": energy_envelope,
        }
    finally:
        os.unlink(path)


class VideoReq(BaseModel):
    fileId: str


@app.post("/cut-frequency")
def cut_frequency(req: VideoReq):
    path = download_file(req.fileId)
    try:
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        prev = None
        cuts = []
        idx = 0
        threshold = 38.0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            small = cv2.resize(frame, (160, 90))
            hist = cv2.calcHist(
                [small], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256]
            )
            hist = cv2.normalize(hist, hist).flatten()
            if prev is not None:
                diff = float(np.sum(np.abs(hist - prev)) * 100)
                if diff > threshold:
                    cuts.append(idx / fps)
            prev = hist
            idx += 1
        cap.release()

        duration = idx / fps if fps else 0
        cuts_per_second = len(cuts) / duration if duration else 0

        if len(cuts) >= 2:
            durations = np.diff([0.0] + cuts + [duration])
            avg = float(np.mean(durations))
            var = float(np.var(durations))
        else:
            avg = duration
            var = 0.0

        return {
            "cutsPerSecond": cuts_per_second,
            "avgShotDuration": avg,
            "variance": var,
        }
    finally:
        os.unlink(path)


@app.post("/motion-energy")
def motion_energy(req: VideoReq):
    path = download_file(req.fileId)
    try:
        cap = cv2.VideoCapture(path)
        prev = None
        profile = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            gray = cv2.cvtColor(
                cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY
            )
            if prev is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
                )
                mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
                profile.append(float(np.mean(mag)))
            prev = gray
        cap.release()

        if not profile:
            return {"profile": []}
        arr = np.array(profile)
        if arr.max() > 0:
            arr = arr / arr.max()
        target = min(200, len(arr))
        idx = np.linspace(0, len(arr) - 1, target).astype(int)
        return {"profile": arr[idx].tolist()}
    finally:
        os.unlink(path)


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5005)
