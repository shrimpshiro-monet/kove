"""
Unified LLM Provider with multi-vendor fallback chain.

Priority: Cerebras → Groq → NVIDIA NIM → DigitalOcean

Two modes:
  - Vision: prompt + images (for frame analysis, reference classification)
  - Text:   prompt only (for DNA-to-text, semantic analysis)

Requires at least one of: CEREBRAS_API_KEY, GROQ_API_KEY,
NVIDIA_NIM_API_KEY, DIGITALOCEAN_API_KEY env var.
Auto-loads from .dev.vars if not already set.
"""

import base64
import io
import json
import logging
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional

try:
    from openai import OpenAI
    _HAS_OPENAI = True
except ImportError:
    _HAS_OPENAI = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Env loading
# ---------------------------------------------------------------------------

_loaded_env = False


def _load_dev_vars():
    """Load .dev.vars into os.environ (no-op if any key already set)."""
    global _loaded_env
    if _loaded_env:
        return
    _loaded_env = True

    # Already have at least one key — nothing to load
    if any(os.environ.get(k) for k in (
        "CEREBRAS_API_KEY", "GROQ_API_KEY",
        "NVIDIA_NIM_API_KEY", "DIGITALOCEAN_API_KEY",
    )):
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


# ---------------------------------------------------------------------------
# Provider registry — order = priority (first available wins)
# ---------------------------------------------------------------------------

MAX_IMAGE_SIZE = 512
MAX_IMAGES = 5
REQUEST_TIMEOUT = 120

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.DOTALL)


def _strip_think(text: str) -> str:
    """Remove <think>...</thinking> blocks some models emit."""
    return _THINK_RE.sub("", text).strip()


def _build_providers():
    """Return [(name, base_url, api_key, text_model, vision_model), ...] in priority order."""
    return [
        (
            "Cerebras",
            "https://api.cerebras.ai/v1",
            os.environ.get("CEREBRAS_API_KEY"),
            "llama-3.3-70b",
            "llama-3.3-70b",  # Cerebras vision via same model
        ),
        (
            "Groq",
            "https://api.groq.com/openai/v1",
            os.environ.get("GROQ_API_KEY"),
            "llama-3.3-70b-versatile",
            "llama-3.3-70b-versatile",  # Groq vision via same model
        ),
        (
            "NVIDIA NIM",
            "https://integrate.api.nvidia.com/v1",
            os.environ.get("NVIDIA_NIM_API_KEY"),
            os.environ.get("NVIDIA_NIM_MODEL", "moonshotai/kimi-k2.6"),
            "nvidia/llama-3.3-nemotron-super-49b-v1",
        ),
        (
            "DigitalOcean",
            "https://inference.do-ai.run/v1",
            os.environ.get("DIGITALOCEAN_API_KEY"),
            "mimo-v2.5",
            "nemotron-nano-12b-v2-vl",
        ),
    ]


# ---------------------------------------------------------------------------
# Client cache (one per mode)
# ---------------------------------------------------------------------------

_text_client = None
_text_model: str = ""
_text_provider: str = ""
_text_base_url: str = ""
_text_api_key: str = ""

_vision_client = None
_vision_model: str = ""
_vision_provider: str = ""
_vision_base_url: str = ""
_vision_api_key: str = ""


def _make_client(base_url: str, api_key: str):
    """Create OpenAI client if SDK available, else return None (urllib fallback)."""
    if _HAS_OPENAI:
        return OpenAI(base_url=base_url, api_key=api_key, timeout=REQUEST_TIMEOUT)
    return None


def _get_text_config() -> Optional[tuple]:
    """Return (client_or_None, model, provider_name, base_url, api_key) for text mode."""
    global _text_client, _text_model, _text_provider, _text_base_url, _text_api_key
    if _text_model:
        return _text_client, _text_model, _text_provider, _text_base_url, _text_api_key

    for name, base_url, api_key, text_model, _ in _build_providers():
        if not api_key:
            continue
        _text_client = _make_client(base_url, api_key)
        _text_model = text_model
        _text_provider = name
        _text_base_url = base_url
        _text_api_key = api_key
        logger.info(f"Text LLM: {name} ({text_model})")
        print(f"  [llm] Text: {name} ({text_model})")
        return _text_client, _text_model, _text_provider, _text_base_url, _text_api_key

    logger.warning("No text LLM API key configured")
    return None


def _get_vision_config() -> Optional[tuple]:
    """Return (client_or_None, model, provider_name, base_url, api_key) for vision mode."""
    global _vision_client, _vision_model, _vision_provider, _vision_base_url, _vision_api_key
    if _vision_model:
        return _vision_client, _vision_model, _vision_provider, _vision_base_url, _vision_api_key

    for name, base_url, api_key, _, vision_model in _build_providers():
        if not api_key:
            continue
        _vision_client = _make_client(base_url, api_key)
        _vision_model = vision_model
        _vision_provider = name
        _vision_base_url = base_url
        _vision_api_key = api_key
        logger.info(f"Vision LLM: {name} ({vision_model})")
        print(f"  [llm] Vision: {name} ({vision_model})")
        return _vision_client, _vision_model, _vision_provider, _vision_base_url, _vision_api_key

    logger.warning("No vision LLM API key configured")
    return None


def _urllib_post(base_url: str, api_key: str, body: dict,
                 timeout: int = REQUEST_TIMEOUT) -> Optional[str]:
    """Fallback POST using urllib when openai SDK is unavailable."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    data = json.dumps(body).encode("utf-8")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"{base_url}/chat/completions"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                text = result["choices"][0]["message"].get("content") or ""
                return _strip_think(text) or None
        except urllib.error.HTTPError as e:
            code = e.code
            if code in (401, 403, 402, 404):
                return None
            if code == 429 or 500 <= code < 600:
                time.sleep(1 * (2 ** attempt))
                continue
            return None
        except Exception:
            return None
    return None


# ---------------------------------------------------------------------------
# Image utilities
# ---------------------------------------------------------------------------

def _resize_image(path: str) -> str:
    """Downscale image to MAX_IMAGE_SIZE, return base64 JPEG data URL."""
    from PIL import Image

    img = Image.open(path)
    img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.LANCZOS)
    if img.mode == "RGBA":
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _mosaic_images(paths: List[str]) -> str:
    """Combine multiple images into a labeled mosaic grid, return base64 data URL."""
    from PIL import Image, ImageDraw

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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def call_text_llm(prompt: str, max_tokens: int = 2048,
                  system_prompt: Optional[str] = None) -> Optional[str]:
    """
    Call the best available text LLM with a text-only prompt.

    Tries Cerebras → Groq → NVIDIA NIM → DigitalOcean.
    Returns response text or None on failure.
    """
    _load_dev_vars()
    cfg = _get_text_config()
    if not cfg:
        return None
    client, model, provider, base_url, api_key = cfg

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }

    try:
        t0 = time.time()
        if client is not None:
            response = client.chat.completions.create(**body)
            content = response.choices[0].message.content or ""
            content = _strip_think(content)
        else:
            content = _urllib_post(base_url, api_key, body) or ""
        elapsed = time.time() - t0
        print(f"  [llm] Text ({provider}): {len(content)} chars ({elapsed:.1f}s)")
        return content or None

    except Exception as e:
        logger.error(f"Text LLM error ({provider}): {e}")
        return None


def call_vision_llm(
    prompt: str, image_paths: List[str], max_tokens: int = 2048
) -> Optional[str]:
    """
    Call the best available vision LLM with prompt and images.

    Tries Cerebras → Groq → NVIDIA NIM → DigitalOcean.
    Returns response text or None on failure.
    """
    _load_dev_vars()
    cfg = _get_vision_config()
    if not cfg:
        return None
    client, model, provider, base_url, api_key = cfg

    paths = image_paths[:MAX_IMAGES]
    if len(image_paths) > MAX_IMAGES:
        logger.warning(f"Capping images from {len(image_paths)} to {MAX_IMAGES}")

    print(f"  [llm] Vision: {provider} ({model}) with {len(paths)} images")

    image_content: list = [{"type": "text", "text": prompt}]
    if len(paths) == 1:
        data_url = _resize_image(paths[0]) if os.path.exists(paths[0]) else ""
    else:
        data_url = _mosaic_images(paths)
    if data_url:
        image_content.append({
            "type": "image_url",
            "image_url": {"url": data_url},
        })

    body = {
        "model": model,
        "messages": [{"role": "user", "content": image_content}],
        "max_tokens": max_tokens,
    }

    try:
        t0 = time.time()
        if client is not None:
            response = client.chat.completions.create(**body)
            text = response.choices[0].message.content or ""
            text = _strip_think(text)
        else:
            text = _urllib_post(base_url, api_key, body) or ""
        elapsed = time.time() - t0
        print(f"  [llm] Vision ({provider}): {len(text)} chars ({elapsed:.1f}s)")
        return text or None

    except Exception as e:
        logger.error(f"Vision LLM error ({provider}): {e}")
        return None
