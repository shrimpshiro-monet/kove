"""Multi-provider LLM client with fallback chain.

Priority: Groq → Cerebras → NVIDIA → Azure
All use OpenAI-compatible API.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

# Load .env file from project root
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)


class LLMClient:
    """Unified LLM client with provider fallback."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.providers = [
            {
                "name": "groq",
                "base_url": "https://api.groq.com/openai/v1",
                "api_key": api_key or os.environ.get("GROQ_API_KEY"),
                "model": "llama-3.3-70b-versatile",
            },
            {
                "name": "cerebras",
                "base_url": "https://api.cerebras.ai/v1",
                "api_key": os.environ.get("CEREBRAS_API_KEY"),
                "model": "llama-3.3-70b",
            },
            {
                "name": "nvidia",
                "base_url": "https://integrate.api.nvidia.com/v1",
                "api_key": os.environ.get("NVIDIA_NIM_API_KEY"),
                "model": os.environ.get("NVIDIA_NIM_MODEL", "moonshotai/kimi-k2.6"),
            },
            {
                "name": "azure",
                "base_url": os.environ.get("AZURE_OPENAI_ENDPOINT", "https://monet-editor-resource.services.ai.azure.com/openai/v1"),
                "api_key": os.environ.get("AZURE_OPENAI_API_KEY"),
                "model": os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini"),
            },
        ]

    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 4096) -> str:
        """Generate text using the first available provider."""
        last_error = None

        for provider in self.providers:
            if not provider.get("api_key"):
                continue

            try:
                client = OpenAI(
                    api_key=provider["api_key"],
                    base_url=provider["base_url"],
                )

                response = client.chat.completions.create(
                    model=provider["model"],
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )

                return response.choices[0].message.content or ""

            except Exception as e:
                last_error = e
                continue

        raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")

    @property
    def active_provider(self) -> str:
        """Return the name of the first available provider."""
        for provider in self.providers:
            if provider.get("api_key"):
                return provider["name"]
        return "none"
