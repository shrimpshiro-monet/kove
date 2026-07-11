"""
DigitalOcean Inference LLM Provider
Routes all LLM calls through a single vendor with two models:
  - nemotron-nano-12b-v2-vl (vision) — for frames
  - mimo-v2.5                (text)   — for DNA-to-text tasks

Requires DIGITALOCEAN_API_KEY env var.
Auto-loads from .dev.vars if not already set.
"""

import base64
import json
import logging
import os
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

_loaded_env = False


def _load_dev_vars():
    """Load .dev.vars into os.environ (no-op if key already set)."""
    global _loaded_env
    if _loaded_env:
        return
    _loaded_env = True

    if os.environ.get("DIGITALOCEAN_API_KEY"):
        return

    # Walk up from this file to find .dev.vars at repo root
    for parent in Path(__file__).resolve().parents:
        dev_vars = parent / ".dev.vars"
        if dev_vars.exists():
            with open(dev_vars) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
            break

logger = logging.getLogger(__name__)

DO_ENDPOINT = "https://inference.do-ai.run/v1/chat/completions"
VISION_MODEL = "nemotron-nano-12b-v2-vl"
TEXT_MODEL = "mimo-v2.5"
MAX_IMAGE_SIZE = 512
REQUEST_TIMEOUT = 120
MAX_IMAGES = 5


def _get_api_key() -> Optional[str]:
    _load_dev_vars()
    key = os.environ.get("DIGITALOCEAN_API_KEY", "").strip()
    if not key:
        logger.warning("DO API key missing — using heuristic fallback")
        return None
    return key


def _resize_image(path: str) -> str:
    """Downscale image to MAX_IMAGE_SIZE, return base64 JPEG data URL."""
    from PIL import Image

    img = Image.open(path)
    img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.LANCZOS)
    if img.mode == "RGBA":
        img = img.convert("RGB")

    import io

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _mosaic_images(paths: List[str]) -> str:
    """Combine multiple images into a labeled mosaic grid, return base64 data URL."""
    from PIL import Image, ImageDraw, ImageFont
    import io

    imgs = []
    for p in paths:
        if os.path.exists(p):
            img = Image.open(p)
            img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.LANCZOS)
            if img.mode == "RGBA":
                img = img.convert("RGB")
            imgs.append(img)

    if not imgs:
        return ""
    if len(imgs) == 1:
        buf = io.BytesIO()
        imgs[0].save(buf, format="JPEG", quality=85)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"

    cols = min(3, len(imgs))
    rows = (len(imgs) + cols - 1) // cols
    cell_w = MAX_IMAGE_SIZE
    cell_h = MAX_IMAGE_SIZE
    label_h = 24

    canvas = Image.new("RGB", (cols * cell_w, rows * (cell_h + label_h)), (0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    for i, img in enumerate(imgs):
        r, c = divmod(i, cols)
        x = c * cell_w
        y = r * (cell_h + label_h) + label_h
        canvas.paste(img, (x, y))
        draw.text((x + 4, r * (cell_h + label_h) + 4), f"Frame {i + 1}", fill=(255, 255, 255))

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _post(body: dict, api_key: str, timeout: int = REQUEST_TIMEOUT) -> Optional[str]:
    """POST to DigitalOcean Inference with retry on 429/5xx."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    data = json.dumps(body).encode("utf-8")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    last_error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                DO_ENDPOINT, data=data, headers=headers, method="POST"
            )
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                msg = result["choices"][0]["message"]
                text = msg.get("content") or msg.get("reasoning_content") or ""
                import re as _re
                text = _re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
                return text or None

        except urllib.error.HTTPError as e:
            last_error = e
            code = e.code
            body_text = ""
            try:
                body_text = e.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            if code in (401, 403):
                logger.error(f"DO auth failed — check DIGITALOCEAN_API_KEY ({body_text})")
                return None
            if code == 402:
                logger.error(f"DO credits depleted ({body_text})")
                return None
            if code == 404:
                model = body.get("model", "unknown")
                logger.error(f"Model not found: {model}. Verify model ID. ({body_text})")
                return None
            if code == 429 or 500 <= code < 600:
                wait = 1 * (2 ** attempt)
                logger.warning(f"DO API {code}, retry {attempt + 1}/3 in {wait}s ({body_text})")
                time.sleep(wait)
                continue
            logger.error(f"DO API error {code}: {body_text}")
            return None

        except Exception as e:
            last_error = e
            logger.error(f"DO request failed: {e}")
            return None

    logger.error(f"DO API failed after 3 attempts: {last_error}")
    return None


def call_vision_llm(
    prompt: str, image_paths: List[str], max_tokens: int = 2048
) -> Optional[str]:
    """
    Call DigitalOcean vision model with prompt and images.

    Args:
        prompt: Text prompt for the model.
        image_paths: List of image file paths.
        max_tokens: Max tokens in response.

    Returns:
        Response text or None on failure.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    paths = image_paths[:MAX_IMAGES]
    if len(image_paths) > MAX_IMAGES:
        logger.warning(
            f"Capping images from {len(image_paths)} to {MAX_IMAGES}"
        )

    print(f"  LLM: calling digitalocean ({VISION_MODEL}) with {len(paths)} images")

    content: list = [{"type": "text", "text": prompt}]
    if len(paths) == 1:
        data_url = _resize_image(paths[0]) if os.path.exists(paths[0]) else ""
    else:
        data_url = _mosaic_images(paths)
    if data_url:
        content.append({
            "type": "image_url",
            "image_url": {"url": data_url},
        })

    body = {
        "model": VISION_MODEL,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens,
    }
    return _post(body, api_key)


def call_text_llm(prompt: str, max_tokens: int = 2048) -> Optional[str]:
    """
    Call DigitalOcean text model with a text-only prompt.

    Args:
        prompt: Text prompt for the model.
        max_tokens: Max tokens in response.

    Returns:
        Response text or None on failure.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    print(f"  LLM: calling digitalocean ({TEXT_MODEL})")

    body = {
        "model": TEXT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }
    return _post(body, api_key)
