# Kove v2 — Phase 4: Plumbing + Ship Demo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the plumbing. Wire brain to body. Ship a real demo in 1 week.

**Architecture:** Fix snake_case mismatch, add FastAPI HTTP server, wire frontend to real API, add file upload + export endpoints.

**Tech Stack:** Python FastAPI, TypeScript, React

## Global Constraints

- Fix snake_case → camelCase mismatch between Python Director and TypeScript EDL schema
- Add FastAPI HTTP server for Director
- Wire frontend to real API (no more mock data)
- Add file upload + export endpoints
- Add error handling + progress tracking
- Fix glow/lightLeak filter issues

---

## File Structure

```
workers/python-director/
├── src/
│   ├── __init__.py
│   ├── director.py                 # Existing (fix snake_case output)
│   ├── server.py                   # NEW: FastAPI HTTP server
│   ├── intent_decoder.py           # Existing
│   ├── creative_planner.py         # Existing
│   ├── critic.py                   # Existing
│   ├── style_transfer.py           # Existing
│   └── models.py                   # NEW: Pydantic models for API
├── tests/
│   ├── test_server.py              # NEW: API tests
│   └── test_director.py            # Existing
├── requirements.txt
└── pyproject.toml

apps/web/src/
├── lib/
│   └── api-client.ts               # Update: real API calls
├── components/
│   ├── UploadPanel.tsx             # Update: real file upload
│   ├── PromptInput.tsx             # Existing
│   ├── ExportButton.tsx            # Update: real export
│   └── KoveApp.tsx                 # Update: wire to real API
└── ...

workers/render-worker/src/
├── edl-to-ffmpeg.ts                # Fix: handle transitions
├── effects/
│   ├── glow.ts                     # Fix: invalid filter
│   └── overlay.ts                  # Fix: light_leak filter
└── ...
```

---

## Tasks

### Task 24: Fix snake_case → camelCase Mismatch

**Files:**
- Modify: `workers/python-director/src/director.py`
- Create: `workers/python-director/tests/test_schema_compat.py`

**Interfaces:**
- Consumes: Director output
- Produces: EDL v5.1 with camelCase keys

- [ ] **Step 1: Write failing test**

```python
# tests/test_schema_compat.py
from src.director import Director

def test_director_output_has_camelcase_keys():
    director = Director()
    edl = director.build_edl(
        plan=MagicMock(),
        intent=MagicMock(),
        content={},
        music=MagicMock()
    )
    
    # Must have camelCase keys, not snake_case
    assert "storyArc" in edl["creative"]
    assert "intentChains" in edl["creative"]
    assert "emotionArc" in edl["creative"]
    assert "generativeSlots" in edl["creative"]
    
    # Must NOT have snake_case keys
    assert "story_arc" not in edl["creative"]
    assert "intent_chains" not in edl["creative"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_schema_compat.py -v`
Expected: FAIL

- [ ] **Step 3: Fix director.py to output camelCase**

```python
# In src/director.py, update build_edl method:
"creative": {
    "entities": {},
    "storyArc": [p.dict() for p in plan.story_arc],  # camelCase
    "emotionArc": plan.emotion_arc.dict(),  # camelCase
    "moments": [m.dict() for m in plan.moments],
    "intentChains": {"global": intent.goal, "perMoment": {}},  # camelCase
    "generativeSlots": [],  # camelCase
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_schema_compat.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "fix(director): output camelCase keys to match EDL v5.1 schema"
```

---

### Task 25: Add FastAPI HTTP Server

**Files:**
- Create: `workers/python-director/src/server.py`
- Create: `workers/python-director/tests/test_server.py`

**Interfaces:**
- Produces: HTTP endpoints for Director pipeline

- [ ] **Step 1: Write failing test**

```python
# tests/test_server.py
from fastapi.testclient import TestClient
from src.server import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_generate_edl_endpoint():
    response = client.post("/api/generate", json={
        "prompt": "Make a hype TikTok edit",
        "video_path": "/tmp/test.mp4",
        "audio_path": "/tmp/test.mp3",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "5.1"
    assert "style" in data
    assert "creative" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: FAIL

- [ ] **Step 3: Implement FastAPI server**

```python
# src/server.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
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
    prompt: str
    video_path: str
    audio_path: str
    reference_path: Optional[str] = None

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}

@app.post("/api/generate")
def generate_edl(request: GenerateRequest):
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add FastAPI HTTP server with /api/generate endpoint"
```

---

### Task 26: Fix Effect Filter Issues

**Files:**
- Modify: `workers/render-worker/src/effects/stylistic.ts`
- Modify: `workers/render-worker/src/effects/overlay.ts`
- Modify: `workers/render-worker/src/effects/distortion.ts`

**Interfaces:**
- Fixes: glow, lightLeak, shake filter issues

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/effects/registry.test.ts
describe('Effect filter fixes', () => {
  it('glow produces valid filter (no blend without second input)', () => {
    const result = effectToFilter({ type: 'glow', targetStrength: 0.6, params: {} })
    expect(result).not.toContain('blend=all_mode')
  })

  it('shake respects input dimensions', () => {
    const result = effectToFilter({ type: 'shake', targetStrength: 0.3, params: {} })
    expect(result).not.toContain('1920')
    expect(result).not.toContain('1080')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/render-worker && npx vitest run tests/effects/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Fix glow filter**

```typescript
// src/effects/stylistic.ts
export function glow(params: GlowParams): string {
  const sigma = params.radius * 0.5
  // Use gblur + colorbalance instead of blend (which needs second input)
  return `gblur=sigma=${sigma},colorbalance=rs=${params.threshold * 0.1}`
}
```

- [ ] **Step 4: Fix shake filter**

```typescript
// src/effects/distortion.ts
export function shake(params: ShakeParams): string {
  // Use crop with relative dimensions instead of hardcoded values
  const w = 'iw-' + (params.amplitude * 2)
  const h = 'ih-' + (params.amplitude * 2)
  return `crop=${w}:${h}:${params.amplitude}:${params.amplitude},scale=iw:ih`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd workers/render-worker && npx vitest run tests/effects/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add workers/render-worker/
git commit -m "fix(render-worker): fix glow and shake filter issues"
```

---

### Task 27: Wire Frontend to Real API

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/KoveApp.tsx`
- Modify: `apps/web/src/components/UploadPanel.tsx`
- Modify: `apps/web/src/components/ExportButton.tsx`

**Interfaces:**
- Consumes: FastAPI Director API
- Produces: Real pipeline execution from frontend

- [ ] **Step 1: Update api-client.ts**

```typescript
// src/lib/api-client.ts
const DIRECTOR_API = import.meta.env.VITE_DIRECTOR_API || 'http://localhost:8000'

export async function generateEDL(video: File, audio: File, prompt: string): Promise<unknown> {
  // Upload files first
  const videoUrl = await uploadFile(video)
  const audioUrl = await uploadFile(audio)
  
  // Call Director API
  const response = await fetch(`${DIRECTOR_API}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      video_path: videoUrl,
      audio_path: audioUrl,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Director API error: ${response.statusText}`)
  }
  
  return response.json()
}

async function uploadFile(file: File): Promise<string> {
  // TODO: implement real file upload to storage
  // For now, return local path
  return URL.createObjectURL(file)
}
```

- [ ] **Step 2: Update KoveApp.tsx to handle real responses**

```tsx
// Update KoveApp.tsx
const handleGenerate = async () => {
  if (!videoFile || !audioFile || !prompt) return
  setLoading(true)
  setError(null)
  try {
    const result = await generateEDL(videoFile, audioFile, prompt)
    setEdl(result)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Generation failed')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): wire frontend to real Director API"
```

---

### Task 28: Add File Upload + Export Endpoints

**Files:**
- Modify: `workers/python-director/src/server.py`
- Modify: `workers/python-director/tests/test_server.py`

**Interfaces:**
- Produces: File upload and export endpoints

- [ ] **Step 1: Write failing test**

```python
# Add to tests/test_server.py
def test_upload_endpoint():
    # Create a test file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
        f.write(b'fake video data')
        f.flush()
        
    with open(f.name, 'rb') as video_file:
        response = client.post("/api/upload", files={"file": ("test.mp4", video_file, "video/mp4")})
    
    assert response.status_code == 200
    assert "path" in response.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: FAIL

- [ ] **Step 3: Implement upload endpoint**

```python
# Add to src/server.py
import os
import uuid
from fastapi import UploadFile, File

UPLOAD_DIR = "/tmp/kove-uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {"path": file_path, "filename": file.filename}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add file upload endpoint"
```

---

### Task 29: Add Error Handling + Progress Tracking

**Files:**
- Modify: `workers/python-director/src/server.py`
- Create: `workers/python-director/src/models.py`

**Interfaces:**
- Produces: Error responses and progress status

- [ ] **Step 1: Write failing test**

```python
# Add to tests/test_server.py
def test_generate_with_invalid_input():
    response = client.post("/api/generate", json={
        "prompt": "",  # empty prompt
        "video_path": "/nonexistent.mp4",
        "audio_path": "/nonexistent.mp3",
    })
    assert response.status_code == 422  # validation error

def test_progress_endpoint():
    response = client.get("/api/progress/test-job-id")
    assert response.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: FAIL

- [ ] **Step 3: Add validation + progress**

```python
# Add to src/server.py
from fastapi import Query

class GenerateRequest(BaseModel):
    prompt: str = Query(..., min_length=1, max_length=1000)
    video_path: str = Query(..., min_length=1)
    audio_path: str = Query(..., min_length=1)
    reference_path: Optional[str] = None

# Simple in-memory progress tracking
progress_store = {}

@app.get("/api/progress/{job_id}")
def get_progress(job_id: str):
    return progress_store.get(job_id, {"status": "not_found"})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/python-director/
git commit -m "feat(director): add validation and progress tracking"
```

---

### Task 30: E2E Integration Test

**Files:**
- Create: `tests/test_e2e.py`

**Interfaces:**
- Tests: Full pipeline from prompt to EDL

- [ ] **Step 1: Write failing test**

```python
# tests/test_e2e.py
from unittest.mock import patch, MagicMock
from src.director import Director

@patch('src.director.genai')
def test_full_pipeline_produces_valid_edl(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"goal": "Test", "genre": "tiktok_edit", "platform": "tiktok", "style": {"aggression": 0.8}, "constraints": []}'
    mock_genai.GenerativeModel.return_value = mock_model
    
    director = Director()
    edl = director.direct("Make a test edit", "/tmp/video.mp4", "/tmp/audio.mp3")
    
    # Validate against schema structure
    assert edl["version"] == "5.1"
    assert "style" in edl
    assert "tokens" in edl["style"]
    assert "creative" in edl
    assert "storyArc" in edl["creative"]  # camelCase!
    assert "intentChains" in edl["creative"]  # camelCase!
    assert "runtime" in edl
    assert "timeline" in edl["runtime"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_e2e.py -v`
Expected: FAIL (snake_case keys)

- [ ] **Step 3: Run test after fixes**

Run: `cd workers/python-director && source .venv/bin/activate && python -m pytest tests/test_e2e.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add workers/python-director/tests/test_e2e.py
git commit -m "test(director): add e2e integration test with schema validation"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 24 | Fix snake_case mismatch | 30 min |
| 25 | Add FastAPI HTTP server | 45 min |
| 26 | Fix effect filter issues | 30 min |
| 27 | Wire frontend to real API | 30 min |
| 28 | Add file upload endpoint | 30 min |
| 29 | Add error handling + progress | 30 min |
| 30 | E2E integration test | 30 min |
| **Total** | | **~4 hours** |

## After Phase 4

You have a working demo:
1. Upload video + song
2. Type prompt
3. Director generates EDL
4. Renderer produces MP4
5. Download result

**Ship to 10 creators. Learn from real usage.**
