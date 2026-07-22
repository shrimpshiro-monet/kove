# E2E Pipeline — Every Code File

## How to Run

1. Set Cloudflare credentials in `.dev.vars`:
```
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

2. Start Python AI worker:
```bash
cd workers/python-ai && source .venv/bin/activate && python lightweight_server.py
```

3. Run pipeline:
```bash
python scripts/e2e-pipeline.py [reference_video] [footage_video]
```

## Flow

```
Reference Video ──┐
                   ├─> Extract 3fps frames ──> Mosaic ──┐
                   │                                     ├──> Vision AI ──> Edit Plan
Your Footage ─────┤                                     │
                   ├─> Extract 3fps frames ──> Mosaic ──┘
                   │
                   └─> Detect cuts in both
                              │
                              v
                    Compile segments based on AI plan
                              │
                              v
                    FFmpeg render with speed + color
                              │
                              v
                         output.mp4
```

## Python Worker Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /extract-frames` | FFmpeg 3fps extraction |
| `POST /detect-cuts` | Histogram-based scene detection |
| `POST /create-mosaic` | Contact sheet from frames |
| `POST /analyze-motion` | Optical flow motion classification |
| `POST /analyze-color` | Per-shot color profiling |

## Vision AI

Uses **Cloudflare Workers AI** `@cf/meta/llama-3.2-11b-vision-instruct`.

Sends BOTH reference and footage mosaics in ONE API call. AI analyzes:
- Reference editing style, pacing, color mood
- Footage content, best moments
- Edit recommendations (shot selection, timing, speed, color, transitions)

## Code Files

See `scripts/e2e-pipeline.py` for the complete pipeline.
See `workers/python-ai/lightweight_server.py` for all endpoints.
See `workers/python-ai/workers/frame_mosaic.py` for mosaic generation.
