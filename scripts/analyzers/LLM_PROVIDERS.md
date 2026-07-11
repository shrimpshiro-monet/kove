# LLM Providers

## Current Provider: DigitalOcean Inference

All LLM calls route through `llm_provider.py` to DigitalOcean Inference.

**Endpoint:** `https://inference.do-ai.run/v1/chat/completions`

### Models

| Model | Purpose | Cost (in/out per 1M tokens) |
|-------|---------|-----------------------------|
| `nemotron-nano-12b-v2-vl` | Vision — frame analysis, semantic events, type classification | $0.20 / $0.60 |
| `mimo-v2.5` | Text — DNA-to-text tasks | $0.10 / $0.28 |

### Authentication

Set the `DIGITALOCEAN_API_KEY` environment variable:

```bash
export DIGITALOCEAN_API_KEY="dop_v1_..."
```

Get an API key at: https://cloud.digitalocean.com/account/api/tokens

### Usage

```python
from llm_provider import call_vision_llm, call_text_llm

# Vision: analyze frames
response = call_vision_llm("Describe what's happening", ["frame1.jpg", "frame2.jpg"])

# Text: DNA-to-text tasks
response = call_text_llm("Summarize this edit style")
```

### How to Swap Providers Later

Edit the constants at the top of `llm_provider.py`:

```python
DO_ENDPOINT = "https://new-provider.com/v1/chat/completions"
VISION_MODEL = "new-vision-model"
TEXT_MODEL = "new-text-model"
```

Update `_get_api_key()` if the env var name changes.

### Failure Modes

| Error | Meaning | Action |
|-------|---------|--------|
| 401/403 | Invalid API key | Check `DIGITALOCEAN_API_KEY` |
| 402 | Credits depleted | Top up DO account |
| 404 | Model not found | Verify model ID spelling |
| 429 | Rate limited | Auto-retries 2x with backoff |
| 5xx | Server error | Auto-retries 2x with backoff |
| Timeout | Network issue | Check connectivity |
| Missing env var | No API key set | Pipeline falls back to heuristics |

All failures return `None` — callers fall back to heuristic analysis automatically.

### Cost Notes

- Vision calls use a mosaic of frames (single image, multiple frames combined)
- Semantic analysis: up to 10 frames per call (~$0.0012/call)
- Classification: 1 mosaic per call (~$0.0006/call)
- Total per pipeline run: ~$0.002 (pennies)
