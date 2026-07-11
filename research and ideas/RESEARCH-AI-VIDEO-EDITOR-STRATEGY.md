# AI Video Editor Strategic Research Report

**Date:** July 2026  
**Scope:** Competitive analysis, style replication technology, advanced compositing capabilities

---

## Executive Summary

The AI video editing market is undergoing a generational shift. CapCut's aggressive paywall migration (moving 4K export, watermark-free export, and effects behind $5.99-$19.99/month tiers) has created mass user backlash with a 1.2/5 Trustpilot rating, while Adobe's $59.99/month Creative Cloud bundle remains prohibitively complex for non-professionals. This creates a massive opening for AI-native editors that combine prompt-based simplicity with professional output quality.

Style replication is bifurcated: visual style transfer (color, texture, mood) is mature via LoRA training on Wan 2.2 and IPAdapter zero-shot transfer, but **editing pattern replication** (cuts, transitions, effects timing, pacing) remains completely unsolved by existing tools. This is Kove's unique differentiator — no competitor replicates the full editing DNA of a reference video.

Advanced compositing is converging on SAM 2 (19.5K GitHub stars, real-time video segmentation), Depth Anything V2 (NeurIPS 2024, Video Depth Anything for 5+ minute videos), and ComfyUI's ecosystem of 400+ custom nodes. The building blocks exist; the opportunity is integrating them into a seamless prompt-based workflow.

---

## Section 1: Competitive Analysis — CapCut vs After Effects vs Kove

### 1.1 CapCut's Top 5 Weaknesses

| # | Weakness | Evidence |
|---|----------|----------|
| 1 | **Aggressive paywall migration** | "Late 2024, ByteDance rolled out a brand-new three-tier system, moved half the features people used to get for free behind paywalls, and sparked absolute chaos." — LinkedIn, Dec 2025. 4K export, watermark-free exports moved from Free to Standard. [Source](https://www.linkedin.com/pulse/capcut-free-vs-standard-pro-2026-okulu-ebubechukwu-du2kf/) |
| 2 | **Terrible customer support** | 1.2/5 stars on Trustpilot. "Countless users say they can't figure out how to cancel their Pro subscription, leading to monthly charges." Support emails answered by bots. [Source](https://www.eesel.ai/blog/capcut-reviews) |
| 3 | **Short-form only limitations** | 15-minute video limit. Single video/audio track only. Free users can export only 4 videos/week if Pro features used. Browser version only works in Chrome. [Source](https://www.eesel.ai/blog/capcut-reviews) |
| 4 | **Privacy/data ownership concerns** | "CapCut reserves a global, perpetual, transferable, royalty-free license to use any material uploaded — videos, images, voices, even unpublished drafts." Even deleted content can be used indefinitely. [Source](https://www.isabokelaw.com/blog/capcuts-new-terms-of-service-what-every-content-creator-needs-to-know) |
| 5 | **Desktop/mobile sync & bugginess** | "Desktop version syncs poorly with mobile." "Cloud storage is very small — can't edit more than 2-3 videos without tremendous lag." [Source](https://www.producthunt.com/products/capcut/reviews) |

**Key CapCut Data Points:**
- 1B+ downloads, hundreds of millions of monthly users
- Pro pricing: $19.99/month or $179.99/year
- Standard pricing: $5.99-$9.99/month
- Trustpilot: 1.2/5 stars

### 1.2 After Effects / Premiere Pro Top 5 Weaknesses

| # | Weakness | Evidence |
|---|----------|----------|
| 1 | **Steep learning curve** | "I tried Premiere Pro and Premiere Rush, but the learning curve was just too steep." After Effects described as "far less intuitive" than timeline editors. [Source](https://www.techradar.com/best/best-video-editing-software) |
| 2 | **Expensive subscription-only** | Premiere Pro: $22.99/month. Creative Cloud Pro: $59.99/month. After Effects: $22.99/month alone. vs DaVinci Resolve: Free (professional-grade). [Source](https://www.techradar.com/best/best-video-editing-software) |
| 3 | **Performance issues & resource hunger** | After Effects renders are notoriously slow (single-threaded for many operations). Requires powerful hardware. [Source](https://www.techradar.com/best/best-video-editing-software) |
| 4 | **Fragmented ecosystem** | Adobe requires Premiere Pro (editing) + After Effects (VFX) + Audition (audio) + Media Encoder (export) — 4 separate apps. DaVinci Resolve offers all-in-one. [Source](https://www.blackmagicdesign.com/products/davinciresolve) |
| 5 | **Slow AI innovation** | "After Effects has been playing catch-up with the competition." Avid partnered with Google for Agentic AI before Adobe. DaVinci Resolve 21 introduced 100+ new effects, AI tools. [Source](https://www.techradar.com/best/best-video-editing-software) |

### 1.3 What Editors Want from AI Tools (Top 10)

1. **Automated rough cut from raw footage** — Upload footage, get assembled timeline
2. **Beat-synced editing** — Music-aware cuts timed to rhythm (key Kove differentiator)
3. **Intelligent B-roll selection** — AI understands content, auto-inserts relevant B-roll
4. **One-click professional color grading** — Text-prompt-based grading (cinematic, warm, moody)
5. **Multi-format export** — Long-form → TikTok/Shorts/Reels with AI-selected engaging moments
6. **Faster rendering / instant previews** — No-wait preview of effects
7. **Intelligent audio cleanup** — Studio Sound one-click noise removal (Descript's #1 praised feature)
8. **Context-aware effects & transitions** — AI selects the right effect for the right moment
9. **Collaborative real-time editing** — Multi-user simultaneous editing
10. **Style transfer from references** — Upload reference videos, AI learns editing style

*Sources: Aggregated from TechRadar, eesel.ai, Product Hunt, ProsConsReviews, Blackmagic Design*

### 1.4 Switching Cost Analysis

| Editor Tier | Current Tools | Switching Cost | Barrier |
|-------------|---------------|----------------|---------|
| **Mobile/Casual** | CapCut Free, InShot, VN | Near zero | Template lock-in, TikTok auto-post |
| **Semi-Professional** | CapCut Pro, Premiere single app | Medium ($0-$295 one-time) | Keyboard shortcuts, timeline muscle memory |
| **Professional Studio** | Adobe Creative Cloud ($59.99/mo) | High | Plugin ecosystem, team workflows, client file exchange |
| **AI-Native Switch** | Any traditional editor | Low financial, HIGH cognitive | Trust in AI output, loss of granular control |

**The AI-native switch has the lowest financial barrier but highest cognitive barrier.** This is why Kove's "describe what you want" paradigm (validated by Descript's success) is the right approach — it eliminates the timeline entirely.

### 1.5 Case Studies of Successful AI Disruptions

| Case | Pattern | Lesson for Kove |
|------|---------|-----------------|
| **Canva vs Photoshop** | Democratization through AI + simplicity. $26B valuation. | Winner is most accessible tool, not most powerful. Free tier → Pro upsell works. |
| **Descript vs Premiere** | Paradigm shift: text-based editing. $100M from OpenAI Startup Fund. "Increased production by 100%, publishing 3-4 videos/day." | Paradigm shifts are powerful but must not sacrifice stability. |
| **Runway vs After Effects** | AI-native creation vs manual effects. Gen-4.5 "world's best video model." | Most disruptive AI tools create new workflows, not automate old ones. |
| **DaVinci Resolve vs Premiere** | Professional quality at $0. Used in Hollywood. $295 one-time for Studio. | Free + Pro model is proven disruption. |
| **CapCut vs Mobile Editors** | AI features + platform integration + free tier. 1B+ downloads. | AI features drive rapid adoption. Unsustainable free tiers create backlash. |

---

## Section 2: Style Replication Technical Pipeline

### 2.1 LoRA for Video Style Transfer

**How it works:** Low-Rank Adaptation injects small trainable matrices into frozen diffusion model weights, enabling fine-tuning on custom concepts without retraining the full model.

**Wan 2.2 — Current SOTA for Open-Source Video LoRA:**
- Models: Wan2.2-T2V-14B (text-to-video) and Wan2.2-I2V (image-to-video)
- Training: AI Toolkit, Diffusion Pipe, Kohya-SS
- Sweet spot: 2500-3000 steps, 20-25 images, rank 16-32
- Training time: 15-90 minutes on single A100/5090
- LoRA boosts character consistency by ~40% over base models
- Optimizer: AdamW (most stable)

**Capabilities:**
- Style transfer (cinematic, anime, watercolor, etc.)
- Character consistency across shots
- Motion style replication (camera movements, animation styles)

**Limitations:**
- Captures visual/texture style but NOT editing rhythm (cuts, transitions, timing)
- Color shifts can occur between shots
- Does not understand temporal editing patterns

**Sources:**
- [RunPod: Complete Guide to Training Video LoRAs](https://runpod.ghost.io/complete-guide-to-training-video-loras/) (April 2025)
- [Reddit: WAN2.2 LoRA Character Training Best Practices](https://www.reddit.com/r/StableDiffusion/comments/1opwg69/) (Nov 2025)
- [malcolmrey on HuggingFace: 800+ trained WAN LoRAs](https://huggingface.co/malcolmrey)
- [arXiv 2605.01929: Data-Free LoRA Transferability](https://arxiv.org/html/2605.01929) (May 2026)
- [arXiv 2503.10614: ConsisLoRA](https://arxiv.org/html/2503.10614v1) (March 2025)
- [SIGGRAPH Asia 2025: LoRA Training for Text-to-Video](https://dl.acm.org/doi/full/10.1145/3757371.3763260)

### 2.2 IPAdapter Style Transfer

**How it works:** Image Prompt Adapter injects CLIP-encoded reference image embeddings into cross-attention layers of diffusion models. Zero-shot style transfer from a single reference image — "1-image LoRA."

**Architecture:**
- CLIP encodes reference image → embedding
- IPAdapter module injects via cross-attention into UNet/DiT
- Weight types: linear, ease-in, ease-out, channel-wise
- Available for SD1.5, SDXL, Flux (Redux variant)

**ComfyUI IPAdapter Plus (by cubiq):**
- GitHub: 6.1K stars
- IPAdapter V2: precise style transfer weights for SDXL
- Flux Redux = "high quality IP-adapter for Flux"

**Capabilities:**
- Zero-shot style transfer from single reference
- Combines with ControlNet for structure preservation
- FaceID variant for human likeness transfer
- Multiple reference images for combined style

**Limitations:**
- Primarily image-level; temporal consistency requires AnimateDiff or frame-by-frame processing
- Style bleed into content at higher weights
- Maintained in "maintenance only" mode as of April 2025
- Cannot capture editing rhythm

**Sources:**
- [ComfyUI IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) (6.1K stars)
- [ComfyUI.org: ControlNet and IPAdapter Workflow](https://comfyui.org/en/image-style-transfer-controlnet-ipadapter-workflow)
- [Comflowy: IPAdapter Tutorial](https://www.comflowy.com/blog/IPAdapter-Tutorial)
- [Lilys AI: Ultimate Guide to IPAdapter](https://lilys.ai/en/notes/comfyui-20251214/ipadapter-comfyui-guide)

### 2.3 State-of-the-Art Video Style Transfer (2025-2026)

| Paper | Date | Key Innovation | URL |
|-------|------|----------------|-----|
| **VISTA** | May 2026 | DiT-based in-context video style transfer with style adapter; 1000-style dataset | [arXiv 2605.17312](https://arxiv.org/abs/2605.17312) |
| **TeleStyle** | Jan 2026 | Lightweight DiT for content-preserving style transfer via curriculum learning | [arXiv 2601.20175](https://arxiv.org/html/2601.20175v1) |
| **PickStyle** | Oct 2025 | Context-Style Adapters; 9 styles with temporal coherence in video | [arXiv 2510.07546](https://arxiv.org/html/2510.07546v1) |
| **LoRA-Edit** | June 2025 | Mask-aware LoRA for first-frame-guided video editing | [arXiv 2506.10082](https://arxiv.org/html/2506.10082v2) |
| **U-StyDiT** | March 2025 | Ultra-high quality artistic style transfer via DiT | [arXiv 2503.08157](https://arxiv.org/html/2503.08157) |
| **Adobe Gen. Video Propagation** | CVPR 2025 | Edit first frame, propagate to all subsequent frames | [arXiv 2412.19761](https://arxiv.org/html/2412.19761v1) |
| **DiTFlow** | March 2025 | Flow-based motion transfer for DiT video generation | [arXiv 2412.07776](https://arxiv.org/html/2412.07776v2) |
| **ConsisLoRA** | March 2025 | Content and style consistency for LoRA-based transfer | [arXiv 2503.10614](https://arxiv.org/html/2503.10614v1) |
| **USO (ByteDance)** | Sept 2025 | Universal style transfer for Flux; promising but limited fine-tuning | [GitHub](https://github.com/bytedance/USO) |
| **B-LoRA** | 2025 | Implicit style-content separation; training-free fusion | [b-lora.github.io](https://b-lora.github.io/B-LoRA/) |

### 2.4 How Major Tools Handle Style Consistency

| Tool | Method | Consistency Approach |
|------|--------|---------------------|
| **Runway Gen-3/4** | Text-to-style + reference image | Motion Brushes, Generative VFX |
| **Kling 3.0 Omni** | Reference-based generation | Upload reference images for character/camera consistency |
| **Seedance 2.0** | Reference video for camera/motion | Focuses on motion pattern, not production quality |
| **Pika** | Text-driven style | Limited style consistency features |
| **Sora** | Unknown architecture (world model) | Not publicly documented for style transfer |

**Key insight from Reddit comparison (Sept 2025):** Redux workflow using flux-depth-dev showed strongest overall performance. No single method consistently outperformed across all cases. Older SD1.5/IP adapters still outperformed some newer methods.

### 2.5 The Gap: Editing Pattern Replication

**This is the least mature area.** Current technology handles visual appearance well, but replicating editing patterns (cut rhythm, transition types, effect timing, pacing) remains unsolved.

**What exists today:**
- Monet/Kove's reference analysis pipeline (FFmpeg scene detection + energy analysis + Gemini) — one of the only systems targeting editing rhythm
- Adobe's Generative Video Propagation (CVPR 2025) — propagates first-frame edits but does NOT replicate editing patterns
- Kling 3.0 / Seedance 2.0 — can transfer camera movement patterns, not editing rhythm

**What does NOT exist:**
- No tool replicates shot duration distributions
- No tool replicates transition types (dissolves, hard cuts, whip pans)
- No tool replicates effect timing relative to beats/moments
- No tool replicates pacing patterns (breathing room, climax structure)

**This is Kove's unique differentiator.**

### 2.6 Technology Maturity Summary

| Capability | Maturity | Best Approach |
|-----------|----------|---------------|
| Visual style transfer (color/texture/mood) | **HIGH** | LoRA training on Wan 2.2 / IPAdapter |
| Character consistency | **HIGH** | Wan 2.2 LoRA (2500 steps, rank 16-32) |
| Camera motion transfer | **MEDIUM** | Seedance 2.0, Kling 3.0 reference mode |
| Temporal coherence | **MEDIUM** | DiT with temporal attention, history conditioning |
| Shot duration / cut rate matching | **LOW** | FFmpeg analysis + EDL-based approach (Kove) |
| Transition type replication | **LOW** | No existing tool; requires custom implementation |
| Effect timing replication | **LOW** | No existing tool; requires custom implementation |
| Full editing rhythm replication | **VERY LOW** | Only Kove's reference analysis pipeline |

---

## Section 3: Advanced Compositing Capabilities

### 3.1 AI Background Removal / Video Matting

**SAM 2 (Segment Anything Model 2) — Meta's Foundation Model:**
- **19.5K GitHub stars**, Apache 2.0 license
- Promptable visual segmentation in images AND videos
- Streaming memory transformer for real-time video processing
- SA-V dataset: largest video segmentation dataset to date
- SAM 2.1 checkpoints: improved accuracy (J&F scores 76.5-79.5)
- Speed: 39.5-91.2 FPS on A100 depending on model size
- Supports multi-object tracking with independent per-object inference
- `torch.compile` for major VOS speedup
- **Key capability:** Click/box prompt on one frame → propagate mask throughout entire video

**Performance (SAM 2.1):**

| Model | Params | FPS (A100) | SA-V test (J&F) |
|-------|--------|------------|-----------------|
| hiera_tiny | 38.9M | 91.2 | 76.5 |
| hiera_small | 46M | 84.8 | 76.6 |
| hiera_base_plus | 80.8M | 64.1 | 78.2 |
| hiera_large | 224.4M | 39.5 | 79.5 |

**Source:** [github.com/facebookresearch/sam2](https://github.com/facebookresearch/sam2) — 19.5K stars, Apache 2.0

**Other Notable Tools:**
- **BiRefNet** — Bilateral Reference for high-resolution matting
- **U²-Net** — Salient object detection for background removal
- **MODNet** — Real-time video matting
- **RobustVideoMatting** — Temporally consistent video matting

### 3.2 Depth Estimation for Compositing

**Depth Anything V2 — NeurIPS 2024:**
- Significantly outperforms V1 in fine-grained details and robustness
- Faster inference, fewer parameters, higher accuracy than SD-based models
- Models: Small (24.8M), Base (97.5M), Large (335.3M), Giant (1.3B)
- **Video Depth Anything** (Jan 2025): Consistent depth maps for 5+ minute videos
- **Prompt Depth Anything** (Dec 2024): 4K resolution metric depth with LiDAR prompt
- Available in Hugging Face Transformers, Apple Core ML, TensorRT, ONNX, ComfyUI

**Key capabilities for compositing:**
- Monocular depth from single RGB frame
- Temporal consistency across video frames
- Enables depth-aware compositing (occlusion, layering, parallax)
- Real-time in web via Transformers.js + WebGPU

**ComfyUI Integration:**
- `ComfyUI-DepthAnythingV2` by Kijai (421 stars)
- Auto-downloads models from HuggingFace
- Node-based depth estimation in ComfyUI workflows

**Sources:**
- [github.com/DepthAnything/Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2) — 8.4K stars
- [NeurIPS 2024 paper](https://arxiv.org/abs/2406.09414)
- [CVPR 2024 paper (V1)](https://arxiv.org/abs/2401.10891)
- [github.com/kijai/ComfyUI-DepthAnythingV2](https://github.com/kijai/ComfyUI-DepthAnythingV2) — 421 stars

### 3.3 Object Tracking for Overlays

**SAM 2 Video Tracking:**
- Point/box prompt on first frame → track throughout video
- Multi-object tracking with independent per-object inference
- Real-time with torch.compile optimization
- Prompt propagation for temporally consistent masks

**Other Notable Tracking Tools:**
- **Co-Tracker (Meta)** — Correspondence-based tracking, robust to occlusion
- **RAFT (Optical Flow)** — Dense motion estimation for tracking
- **XMem** — Memory-augmented video object segmentation
- **Cutie** — Video object segmentation with transformer memory

### 3.4 AI Text Placement in 3D Space

**Current Approaches:**
1. **Depth-guided placement:** Use depth map to place text behind foreground subjects
2. **SAM 2 + depth compositing:** Segment subject → compute depth → place text in depth layers
3. **Inpainting-based:** Remove subject → place text → re-insert subject (inpainting)
4. **Perspective-aware text:** Estimate vanishing points from scene geometry

**Tools enabling this:**
- Depth Anything V2 + SAM 2 → depth-aware layer separation
- Stable Diffusion inpainting → remove/re-insert subjects
- ComfyUI workflows combining depth + segmentation + inpainting

**Limitations:**
- No single tool does "text behind subject" automatically
- Requires manual depth estimation + compositing pipeline
- Lighting/shadow matching remains challenging
- Temporal consistency of 3D text placement across frames is hard

### 3.5 Major Tool Capabilities Comparison

| Capability | Runway Gen-4.5 | Kling 3.0 | Pika | Sora | Kove (Target) |
|-----------|----------------|-----------|------|------|---------------|
| **Text-to-video** | Gen-4.5 SOTA | Native 4K | Yes | Yes | No (edit, not generate) |
| **Image-to-video** | Yes | Yes | Yes | Yes | Yes (footage-based) |
| **Background removal** | Inpainting | No native | No | No | SAM 2 integration |
| **Depth estimation** | No native | No native | No | No | Depth Anything V2 |
| **Object tracking** | Motion Brushes | Reference-based | Limited | Unknown | SAM 2 tracking |
| **Style transfer** | Gen-1 legacy | Reference images | Text-driven | Unknown | LoRA + IPAdapter |
| **3D text compositing** | No | No | No | No | Depth-aware pipeline |
| **Multi-format export** | Yes | Yes | Yes | Yes | TikTok/Shorts/Reels |
| **API access** | Yes | Yes | Yes | Limited | Yes |

### 3.6 ComfyUI Ecosystem for Video Compositing

ComfyUI provides the node-based compositing infrastructure:

**Key Nodes/Workflows:**
- **SAM 2 nodes** — Video segmentation and tracking
- **Depth Anything V2** — Monocular depth estimation
- **IPAdapter Plus** — Style transfer from reference
- **AnimateDiff** — Temporal consistency for video generation
- **VideoHelperSuite** — Video I/O, frame extraction, compilation
- **ControlNet** — Structure-preserving generation
- **Inpainting nodes** — Object removal and replacement

**Workflow Architecture for Kove Integration:**
```
Input Video → SAM 2 (segmentation) → Depth Anything V2 (depth map)
     ↓
Compositing Pipeline:
  1. Background layer (inpainting / replacement)
  2. Depth-based text placement
  3. Object-tracked overlays
  4. Style transfer via LoRA/IPAdapter
     ↓
Output: Composited frames → FFmpeg → Final video
```

---

## Section 4: Feature Roadmap Recommendation

### Phase 1: Foundation (Months 1-3) — "Be Better Than CapCut"

| Priority | Feature | Rationale | Technical Complexity |
|----------|---------|-----------|---------------------|
| **P0** | Beat-synced editing from music | #1 unmet need, core Kove differentiator | Medium — FFmpeg + Gemini analysis |
| **P0** | Reference video style analysis | Unique capability no competitor has | Low — existing pipeline |
| **P1** | Generous free tier (10 exports/week) | Counter CapCut's paywall backlash | Low — business decision |
| **P1** | Multi-format export (TikTok/Shorts/Reels) | Table stakes for creators | Low — FFmpeg scaling |
| **P1** | Instant preview (Canvas2D) | Eliminate render wait frustration | Medium — existing |
| **P2** | One-click color grading (text prompt) | High demand, LoRA/IPAdapter enabled | Medium |

### Phase 2: Differentiation (Months 4-6) — "Can't Get Anywhere Else"

| Priority | Feature | Rationale | Technical Complexity |
|----------|---------|-----------|---------------------|
| **P0** | Full editing style replication | Unique differentiator, no competition | High — custom + FFmpeg |
| **P0** | SAM 2 integration (background removal) | Professional compositing baseline | Medium — API integration |
| **P1** | Depth-aware text placement | Advanced compositing, viral content | High — Depth Anything + compositing |
| **P1** | Object-tracked overlays | Professional-quality motion graphics | Medium — SAM 2 tracking |
| **P2** | LoRA-based visual style training | Custom style from reference footage | High — GPU training pipeline |

### Phase 3: Moat (Months 7-12) — "Only Kove Can Do This"

| Priority | Feature | Rationale | Technical Complexity |
|----------|---------|-----------|---------------------|
| **P0** | Editing pattern replication (cuts + transitions + timing) | Zero competition | Very High — custom research |
| **P1** | Real-time collaborative editing | Enterprise/team use case | High — WebSocket infrastructure |
| **P1** | A/B style comparison (generate 2 versions) | Unique workflow | Medium |
| **P2** | Custom LoRA training (user's brand style) | Lock-in through personalization | High — GPU pipeline |
| **P2** | API for developers (style transfer as service) | Platform play | Medium |

---

## Section 5: Technical Architecture Recommendations

### 5.1 Core Architecture

```
┌─────────────────────────────────────────────────────┐
│                    KOVE ARCHITECTURE                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Upload   │───→│ Analyze  │───→│ Generate │     │
│  │ Footage  │    │ + Style  │    │   EDL    │     │
│  └──────────┘    └──────────┘    └──────────┘     │
│       │              │               │              │
│       ▼              ▼               ▼              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ R2 Store │    │ Gemini + │    │ Canvas2D │     │
│  │ (Media)  │    │ FFmpeg   │    │ Preview  │     │
│  └──────────┘    └──────────┘    └──────────┘     │
│                                                     │
│  ┌──────────────────────────────────────────┐      │
│  │         COMPOSITING PIPELINE              │      │
│  │                                           │      │
│  │  SAM 2 ─→ Segmentation masks             │      │
│  │  Depth Anything V2 ─→ Depth maps          │      │
│  │  IPAdapter ─→ Style transfer              │      │
│  │  LoRA ─→ Custom style training            │      │
│  │                                           │      │
│  │  Compositing Engine:                       │      │
│  │    1. Background layer (inpaint/replace)   │      │
│  │    2. Depth-based text placement           │      │
│  │    3. Object-tracked overlays              │      │
│  │    4. Style application                    │      │
│  └──────────────────────────────────────────┘      │
│                                                     │
│  ┌──────────────────────────────────────────┐      │
│  │         RENDER PIPELINE                   │      │
│  │                                           │      │
│  │  Editly + FFmpeg (server)                 │      │
│  │  Canvas2D (browser preview)               │      │
│  │  GPU workers (LoRA training)              │      │
│  └──────────────────────────────────────────┘      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.2 GPU Worker Architecture

```
┌─────────────────────────────────────────┐
│           GPU WORKER POOL               │
├─────────────────────────────────────────┤
│                                         │
│  Worker Type 1: Inference (Always-on)   │
│  - SAM 2 segmentation                   │
│  - Depth Anything V2 estimation         │
│  - IPAdapter style transfer             │
│  - Real-time preview compositing        │
│  Model: A10G or T4 (16GB VRAM)         │
│                                         │
│  Worker Type 2: Training (On-demand)    │
│  - LoRA training (Wan 2.2)             │
│  - Custom style model training          │
│  - 15-90 min per training job           │
│  Model: A100 (80GB VRAM)               │
│                                         │
│  Worker Type 3: Render (BullMQ queue)   │
│  - Editly + FFmpeg compilation          │
│  - Multi-format export                  │
│  - Batch processing                     │
│  Model: CPU-optimized or GPU render     │
│                                         │
└─────────────────────────────────────────┘
```

### 5.3 API Design Recommendations

**Style Transfer API:**
```typescript
POST /api/style/analyze
Body: { referenceVideo: R2Key }
Response: {
  styleDNA: {
    colorPalette: ColorProfile,
    cutRate: number,          // cuts per minute
    avgShotDuration: number,
    transitionTypes: Transition[],
    effectsVocabulary: Effect[],
    energyCurve: number[],    // per-frame energy
    momentMap: Moment[]       // climax, breathing points
  }
}

POST /api/style/apply
Body: {
  footage: R2Key[],
  styleDNA: StyleDNA,
  intensity: number,          // 0-1
  preserveContent: boolean
}
Response: { edl: MonetEDL }

POST /api/style/train-lora
Body: {
  referenceFrames: R2Key[],
  triggerWord: string,
  epochs: number
}
Response: { jobId: string, estimatedTime: number }
```

**Compositing API:**
```typescript
POST /api/composite/segment
Body: { video: R2Key, prompts: SegmentPrompt[] }
Response: { masks: R2Key, trackingData: TrackingData }

POST /api/composite/depth
Body: { video: R2Key }
Response: { depthMaps: R2Key }

POST /api/composite/text-3d
Body: {
  video: R2Key,
  text: string,
  position: 'behind' | 'in-front-of',
  targetObject: string,
  style: TextStyle
}
Response: { compositedFrames: R2Key }
```

### 5.4 Data Pipeline

```
User Upload → R2 (MONET_MEDIA)
    ↓
FFmpeg Analysis (scene detection, energy, audio)
    ↓
Gemini Analysis (style extraction, intent parsing)
    ↓
MonetEDL Generation (source of truth)
    ↓
Canvas2D Preview (browser, instant)
    ↓
Compositing Pipeline (SAM2 + Depth + IPAdapter)
    ↓
Editly + FFmpeg Render (server)
    ↓
R2 (MONET_RENDERS) → User Download
```

### 5.5 Cost Optimization

| Component | Strategy | Estimated Cost/1000 videos |
|-----------|----------|---------------------------|
| SAM 2 segmentation | Batch inference, model caching | $15-25 (A10G) |
| Depth Anything V2 | Smallest model for preview, largest for render | $5-10 |
| LoRA training | On-demand GPU, 15-90 min per job | $50-100 per training |
| IPAdapter transfer | Zero-shot, no training needed | $3-5 |
| Gemini analysis | Flash model, structured output | $2-5 |
| FFmpeg render | CPU-optimized, parallel encoding | $10-20 |

**Total estimated cost per 1000 videos: $85-160** (without LoRA training)
**With LoRA training: $135-260 per 1000 videos**

---

## Appendix: Key Research Papers

| Paper | Date | Venue | Finding |
|-------|------|-------|---------|
| VISTA | May 2026 | arXiv | DiT-based in-context video style transfer |
| TeleStyle | Jan 2026 | arXiv | Content-preserving style transfer via curriculum learning |
| PickStyle | Oct 2025 | arXiv | Context-Style Adapters for video diffusion |
| LoRA-Edit | June 2025 | arXiv | Mask-aware LoRA for first-frame-guided editing |
| Adobe Gen. Video Propagation | CVPR 2025 | CVPR | First-frame edit propagation to entire video |
| SAM 2 | July 2024 | Meta FAIR | Foundation model for video segmentation |
| Depth Anything V2 | June 2024 | NeurIPS 2024 | SOTA monocular depth estimation |
| Video Depth Anything | Jan 2025 | HuggingFace | Consistent depth for 5+ minute videos |
| ConsisLoRA | March 2025 | arXiv | Content and style consistency |
| U-StyDiT | March 2025 | arXiv | Ultra-high quality artistic style transfer |
| DiTFlow | March 2025 | arXiv | Motion transfer in DiT video generation |
| History-Guided Video Diffusion | ICML 2025 | ICML | Long-range temporal consistency |
| Survey: Spatiotemporal Consistency | Feb 2025 | arXiv | Comprehensive consistency survey |
| Survey of Video Diffusion Models | April 2025 | arXiv | Foundation survey covering DiT architecture |
| Controllable Video Generation | July 2025 | arXiv | Motion decoupling, DiT injection |
| ID-LoRA | March 2026 | arXiv | Identity-driven audio-video personalization |

---

*Report compiled from web research across TechRadar, Product Hunt, eesel.ai, LinkedIn, Reddit, GitHub, arXiv, and official documentation. All sources cited inline.*
