"""
Interactive Thinking Service for Monet AI Video Director.

Provides real-time "thinking" output and clarifying questions
during the editing pipeline, similar to how AI chatbots think out loud.
"""

import os
import sys
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Monet Thinking Service", version="1.0.0")


class ThinkingRequest(BaseModel):
    prompt: str
    footage_count: int = 0
    has_music: bool = False
    has_reference: bool = False
    reference_style: Optional[Dict] = None
    footage_metadata: Optional[List[Dict]] = None


class QuestionRequest(BaseModel):
    prompt: str
    footage_count: int = 0
    has_music: bool = False
    has_reference: bool = False
    analysis_data: Optional[Dict] = None


@app.post("/think")
async def think(req: ThinkingRequest):
    """
    Generate the AI director's thinking process.
    Returns a sequence of thoughts that the frontend displays in real-time.
    """
    thoughts = []
    
    # Step 1: Understanding the request
    thoughts.append({
        "stage": "understanding",
        "text": f"I'm analyzing your request: \"{req.prompt[:100]}{'...' if len(req.prompt) > 100 else ''}\"",
        "icon": "brain",
        "duration_ms": 500,
    })
    
    # Step 2: Assessing what we have
    assets = []
    if req.footage_count > 0:
        assets.append(f"{req.footage_count} footage clip{'s' if req.footage_count > 1 else ''}")
    if req.has_music:
        assets.append("music track")
    if req.has_reference:
        assets.append("reference video")
    
    if assets:
        thoughts.append({
            "stage": "assets",
            "text": f"I have {', '.join(assets)} to work with.",
            "icon": "film",
            "duration_ms": 300,
        })
    
    # Step 3: Style analysis
    if req.reference_style:
        style = req.reference_style
        if isinstance(style, dict):
            effects = style.get("effects", [])
            pacing = style.get("pacing", "unknown")
            thoughts.append({
                "stage": "style",
                "text": f"Reference style detected: {pacing} pacing with {len(effects)} effect types.",
                "icon": "palette",
                "duration_ms": 400,
            })
    
    # Step 4: Music analysis (if available)
    if req.has_music:
        thoughts.append({
            "stage": "music",
            "text": "Analyzing music structure — beats, energy curves, and emotional arc...",
            "icon": "music",
            "duration_ms": 600,
        })
    
    # Step 5: Planning approach
    if req.footage_count > 1:
        thoughts.append({
            "stage": "planning",
            "text": "With multiple clips, I'll cross-cut between them for visual variety.",
            "icon": "scissors",
            "duration_ms": 400,
        })
    else:
        thoughts.append({
            "stage": "planning",
            "text": "Single clip — I'll use different segments and effects to create rhythm.",
            "icon": "scissors",
            "duration_ms": 400,
        })
    
    # Step 6: Creative decisions
    thoughts.append({
        "stage": "creative",
        "text": "Deciding on cut placement, effect intensity, and color treatment...",
        "icon": "sparkles",
        "duration_ms": 500,
    })
    
    return JSONResponse({
        "thoughts": thoughts,
        "total_duration_ms": sum(t["duration_ms"] for t in thoughts),
    })


@app.post("/questions")
async def generate_questions(req: QuestionRequest):
    """
    Generate clarifying questions for the user based on their request.
    The AI asks these to get better results.
    """
    questions = []
    
    # Check what's missing for optimal results
    if not req.has_music:
        questions.append({
            "id": "add_music",
            "question": "Want to add a music track? Beat-synced cuts make edits 10x more engaging.",
            "type": "suggestion",
            "impact": "high",
        })
    
    if req.footage_count == 0:
        questions.append({
            "id": "add_footage",
            "question": "I'll need at least one video clip to work with. Want to upload some footage?",
            "type": "requirement",
            "impact": "critical",
        })
    
    if req.footage_count == 1 and not req.has_music:
        questions.append({
            "id": "single_clip_strategy",
            "question": "With one clip and no music, I'll focus on visual effects and pacing. Want me to find the most dynamic moments?",
            "type": "clarification",
            "impact": "medium",
        })
    
    if req.has_reference:
        questions.append({
            "id": "reference_style",
            "question": "I see a reference video. Want me to match its exact style, or just use it as inspiration?",
            "type": "clarification",
            "impact": "medium",
        })
    
    # Style-specific questions
    prompt_lower = req.prompt.lower()
    
    if any(w in prompt_lower for w in ["tiktok", "reel", "short"]):
        questions.append({
            "id": "platform",
            "question": "For TikTok/Reels, I'll optimize for 9:16 vertical and fast pacing. Want me to add text overlays?",
            "type": "suggestion",
            "impact": "medium",
        })
    
    if any(w in prompt_lower for w in ["cinematic", "movie", "film"]):
        questions.append({
            "id": "cinematic_style",
            "question": "For cinematic look, I'll use slower cuts, color grading, and letterbox. Want a specific color palette (warm/cool/desaturated)?",
            "type": "clarification",
            "impact": "medium",
        })
    
    if any(w in prompt_lower for w in ["amv", "anime", "edit"]):
        questions.append({
            "id": "amv_style",
            "question": "For AMV style, I'll sync cuts to beats and add impact effects. Want glitch/chromatic effects or clean cuts?",
            "type": "clarification",
            "impact": "medium",
        })
    
    if any(w in prompt_lower for w in ["highlight", "sports", "best"]):
        questions.append({
            "id": "highlight_style",
            "question": "For highlights, I'll find the most action-packed moments and add speed ramps. Want slow-mo on key moments?",
            "type": "clarification",
            "impact": "medium",
        })
    
    return JSONResponse({
        "questions": questions,
        "count": len(questions),
    })


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("THINKING_PORT", "8106"))
    uvicorn.run(app, host="0.0.0.0", port=port)
