# Free Resources Roadmap — AI Video Editor for Students

> A comprehensive guide to every free and student-accessible resource for building an AI video editor with zero budget.
> 
> **Last updated:** July 2026
> **Method:** Official documentation and pricing pages verified via web fetch

---

## Table of Contents

1. [Free GPU Access](#1-free-gpu-access)
2. [Free AI API Access](#2-free-ai-api-access)
3. [Student Programs & Education Discounts](#3-student-programs--education-discounts)
4. [Open Source Models (No API Needed)](#4-open-source-models-no-api-needed)
5. [Free Infrastructure](#5-free-infrastructure)
6. [What Can Be Done Entirely Free](#6-what-can-be-done-entirely-free)
7. [Recommended Stack](#7-recommended-stack)
8. [Key Gotchas](#8-key-gotchas)

---

## 1. Free GPU Access

### Tier 1: Always Free (No Credit Card)

| Platform | GPU | Free Allowance | Best For | Source |
|----------|-----|---------------|----------|--------|
| **Google Colab** | T4 (16GB) / K80 | ~4 hrs/day GPU, 100GB disk | Notebooks, training, inference | [colab.research.google.com](https://colab.research.google.com/) |
| **Kaggle Notebooks** | P100 (16GB) | 30 GPU-hours/week, 20GB persistent storage | Notebooks, training | [kaggle.com/docs/notebooks](https://www.kaggle.com/docs/notebooks) |
| **Modal** | T4/L4/A10G | $30/month free credits (~37-51 GPU-hrs T4) | Serverless inference | [modal.com/pricing](https://modal.com/pricing) |
| **Hugging Face Spaces** | Dynamic (T4/A10G) | Queue-based, free for all users | App hosting, demos | [huggingface.co/pricing](https://huggingface.co/pricing) |
| **Cloudflare Workers AI** | Managed | 10,000 Neurons/day (~243 min Whisper) | Edge inference | [developers.cloudflare.com](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| **Lightning AI** | T4 | ~22 GPU-hours/month | IDE + notebooks | [lightning.ai/pricing](https://lightning.ai/pricing) |
| **Sagemaker Studio Lab** | T4 (16GB) | 4 hrs/session, 4 hrs/day | Notebooks (waitlist) | [aws.amazon.com](https://aws.amazon.com/sagemaker/studio-lab/) |

### Tier 2: Free Credits on Signup

| Platform | Credits | GPU Access | Source |
|----------|---------|-----------|--------|
| **Google Cloud** | $300 for 90 days | T4, A100, V100 (~100 hrs T4) | [cloud.google.com/free](https://cloud.google.com/free) |
| **RunPod** | No free tier | RTX A5000 from $0.27/hr | [runpod.io/pricing](https://www.runpod.io/pricing) |
| **Together AI** | $5 new account credit | API inference only | [together.ai/pricing](https://www.together.ai/pricing) |

### Tier 3: Cheapest Paid Options

| Platform | Cheapest GPU | Price/hr | Notes |
|----------|-------------|----------|-------|
| **Vast.ai** | RTX 3060 12GB | $0.03-0.08 (spot) | Marketplace, interruptible |
| **RunPod** | RTX A5000 24GB | $0.27 | Per-second billing |
| **Replicate** | T4 16GB | $0.81 | Model API, not raw GPU |

### Dead/Defunct

| Platform | Status | Date |
|----------|--------|------|
| **Banana.dev** | **SUNSET** | March 31, 2024 |

### Source URLs
- Colab: https://colab.research.google.com/
- Kaggle: https://www.kaggle.com/docs/notebooks
- Modal: https://modal.com/pricing
- HF Spaces: https://huggingface.co/pricing
- Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Lightning AI: https://lightning.ai/pricing
- RunPod: https://www.runpod.io/pricing
- Vast.ai: https://vast.ai/pricing
- Replicate: https://replicate.com/pricing

---

## 2. Free AI API Access

### Always Free Tiers (No Credit Card)

| Provider | Best For | Limits | Source |
|----------|----------|--------|--------|
| **Google Gemini API** | Creative reasoning, vision, structured output | 15 RPM, 1M tokens/day (Flash), 5 RPM (Pro) | [ai.google.dev/pricing](https://ai.google.dev/pricing) |
| **Groq** | Ultra-fast inference, STT (Whisper) | 30 RPM, 500K tokens/day (8B), Whisper 20 RPM | [groq.com/pricing](https://groq.com/pricing/) |
| **Cerebras** | Fastest inference speeds (~1,800 tok/s) | Free tier with community limits | [cerebras.ai/pricing](https://www.cerebras.ai/pricing) |
| **Hugging Face Inference** | Backup for many models | 1,000 API calls/day | [huggingface.co/docs](https://huggingface.co/docs/inference-providers/pricing) |

### Free Credits on Signup

| Provider | Credits | Best For | Expiry | Source |
|----------|---------|----------|--------|--------|
| **NVIDIA NIM** | $1,000 one-time | Vision, video, specialized AI models | ~90 days | [build.nvidia.com](https://build.nvidia.com/) |
| **Google Cloud** | $300 for 90 days | Vertex AI, Video Intelligence, Speech | 90 days | [cloud.google.com/free](https://cloud.google.com/free) |
| **Together AI** | $1 one-time | OSS models, image gen | Minimal | [together.ai/pricing](https://www.together.ai/pricing) |
| **Fireworks AI** | $1 one-time | Fast OSS inference | Minimal | [fireworks.ai/pricing](https://fireworks.ai/pricing) |

### Student Programs

| Provider | Program | Value | Source |
|----------|---------|-------|--------|
| **GitHub Education** | Copilot + Azure $100 | Copilot Pro, Azure credits | [education.github.com/pack](https://education.github.com/pack) |
| **Azure for Students** | $100 credit + 20+ free services | OpenAI, ML, VMs | [azure.microsoft.com/free/students](https://azure.microsoft.com/en-us/free/students/) |

### Providers With NO Free API Tier

| Provider | Status | Notes |
|----------|--------|-------|
| **OpenAI** | No free credits | Discontinued; must pay |
| **Anthropic** | No free credits | Free Claude.ai web only |
| **Mistral** | Trial key only | Rate-limited, no commercial use |

### Recommended API Stack for AI Video Editor

1. **Google Gemini API** — Primary creative AI (EDL generation, vision analysis, structured output)
2. **Groq + Whisper** — Ultra-fast transcription for audio analysis
3. **NVIDIA NIM** — Vision models, Active Speaker Detection, LipSync ($1,000 credits)
4. **Hugging Face** — Backup inference for FLUX/SD (image generation for thumbnails)
5. **Google Cloud** — Video Intelligence API for scene detection ($300 credit)

### Source URLs
- Gemini: https://ai.google.dev/pricing
- Groq: https://groq.com/pricing/
- Cerebras: https://www.cerebras.ai/pricing
- NVIDIA NIM: https://build.nvidia.com/
- Together AI: https://www.together.ai/pricing
- Fireworks: https://fireworks.ai/pricing
- Mistral: https://mistral.ai/pricing/api/
- Cohere: https://cohere.com/pricing

---

## 3. Student Programs & Education Discounts

### GitHub Student Developer Pack

**URL:** https://education.github.com/pack
**Eligibility:** Age 13+, enrolled in degree/diploma course, verified GitHub account

#### Key Benefits for AI Video Editor Developers

| Partner | Benefit | Value |
|---------|---------|-------|
| **GitHub Pro** | Free while student | Advanced code review, Copilot access |
| **GitHub Copilot** | Free while student | AI pair programmer |
| **GitHub Codespaces** | 120 core-hours/month, 15GB storage | Cloud dev environment |
| **GitHub Actions** | 3,000 min/month for private repos | CI/CD |
| **DigitalOcean** | $200 credit for 1 year | Droplets, K8s, databases |
| **Microsoft Azure** | $100 credit + 25+ free services | Cloud compute, AI services |
| **JetBrains** | Free ALL IDEs (IntelliJ, PyCharm, WebStorm, etc.) | $289/yr value |
| **Heroku** | $13/month credit for 24 months | Backend hosting |
| **MongoDB** | $50 Atlas credits | Database |
| **Stripe** | Waived fees on first $1,000 revenue | Payment processing |
| **Vercel** | Free Pro plan while student | Frontend hosting |
| **Notion** | Education plan with AI | Project docs |
| **FrontendMasters** | 6 months free access | Learning |
| **Datadog** | Pro account free for 2 years | Monitoring |
| **Clerk** | Free Pro plan while student | Auth/user management |
| **1Password** | Free for 1 year | Secrets management |
| **Namecheap** | Free .me domain + SSL for 1 year | Domain |
| **BrowserStack** | Free Automate Mobile Plan for 1 year | Testing |

**Total estimated value: ~$1,400/year**

### Azure for Students

**URL:** https://azure.microsoft.com/en-us/free/students/

| Resource | Allowance |
|----------|-----------|
| **Credit** | $100 for 12 months |
| **Free services** | 20+ for 12 months, 65+ always-free |
| **VMs** | 750 hrs/month B1s (12 months) |
| **Azure OpenAI** | Available with credit |
| **Azure ML** | Free tier |
| **Storage** | 5GB Blob Storage |
| **No credit card required** | Renewable annually |

### Google Cloud for Education

**URL:** https://cloud.google.com/edu/students

| Resource | Allowance |
|----------|-----------|
| **Skills Credits** | 200 free credits for labs/courses |
| **Always-free tier** | Cloud Functions (2M), Cloud Storage (5GB), Cloud Run (2M) |
| **Research Credits** | Up to $5,000 for researchers |
| **Cloud Free Trial** | $300 for 90 days (new accounts) |

### AWS Educate

**URL:** https://aws.amazon.com/education/awseducate/

| Resource | Allowance |
|----------|-----------|
| **Labs** | Free hands-on labs (S3, EC2, VPC, RDS) |
| **Training** | Self-paced with digital badges |
| **Job Board** | Access at 18+ |
| **No free credits** | Provides learning, not AWS account credits |

### JetBrains Student License

**URL:** https://www.jetbrains.com/community/education/

| Resource | Allowance |
|----------|-----------|
| **ALL IDEs** | IntelliJ IDEA Ultimate, PyCharm Professional, WebStorm, CLion, GoLand, etc. |
| **AI Assistant** | Included with license |
| **Duration** | Renewable annually |
| **Eligibility** | Students at any educational institution |

### Vercel Pro for Students

**URL:** https://vercel.com/edu

| Resource | Allowance |
|----------|-----------|
| **Plan** | Full Pro plan free while student |
| **Features** | Serverless Functions, Edge Network, CI/CD, Analytics, Custom domains |

### Cloudflare

**No dedicated student program found.** However, the free tier (available to everyone) is generous:

| Service | Free Allowance |
|---------|---------------|
| Workers | 100,000 requests/day |
| R2 | 10GB storage, unlimited egress |
| D1 | 5GB storage, 5M reads/day |
| KV | 100K reads/day, 1GB storage |
| Pages | Unlimited requests, 500 builds/month |

### DigitalOcean (via GitHub Pack)

| Resource | Allowance |
|----------|-----------|
| **Credit** | $200 for 1 year |
| **Covers** | Droplets, Kubernetes, App Platform, databases |
| **Excludes** | GPU Droplets, NVIDIA H100, Bare Metal GPUs |

### Figma Education

**URL:** https://www.figma.com/education/

| Resource | Allowance |
|----------|-----------|
| **Plan** | Full Professional plan free |
| **Includes** | Design, Make, Weave, Dev Mode, Motion, FigJam, Slides, Draw, Sites, Buzz |

### Adobe Education

**URL:** https://www.adobe.com/education/students.html

| Resource | Allowance |
|----------|-----------|
| **Creative Cloud** | ~$19.99/month (vs. $59.99 regular) |
| **Apps** | Premiere Pro, After Effects, Photoshop, Illustrator, etc. |
| **Firefly** | AI creative tools included |

---

## 4. Open Source Models (No API Needed)

### Can Run on CPU (No GPU)

| Model | Task | Params | Notes |
|-------|------|--------|-------|
| **SAM 2** | Video segmentation/tracking | 200M | Explicitly supports CPU inference |
| **Depth Anything V2** | Depth estimation | 300M | Official code loads to CPU; 10x faster than SD-based models |
| **Whisper** (tiny/base/small) | Audio transcription | 39M-244M | Real-time on CPU; large-v3 needs GPU |

### Can Run on Colab Free T4 (16GB VRAM)

| Model | Task | Min VRAM | Speed | License |
|-------|------|----------|-------|---------|
| **Wan 2.1 1.3B** | Text/Video-to-Video | 8.2 GB | Slow (~15-20 min for 5s 480P) | Apache 2.0 |
| **CogVideoX-2B** | Text-to-Video | 5 GB | Works on T4 | Apache 2.0 |
| **CogVideoX-5B** | Text-to-Video | 5-10 GB | Works with INT8 quant | CogVideoX License |
| **FramePack** | Video Generation | **6 GB min** | 10-20s/frame on T4 | Apache 2.0 |
| **FLUX.1-schnell** | Image Generation | ~8 GB (offload) | 1-4 steps only | Apache 2.0 |
| **SDXL + ControlNet** | Controlled Image Gen | ~8 GB | Works with offload | OpenRAIL++ |
| **IP-Adapter** | Style Transfer | 4-6 GB | Trivial adapter (22M) | Apache 2.0 |
| **AnimateDiff** | Motion from SD | 5 GB | 16-frame clips | — |
| **Whisper large-v3** | Transcription | 3 GB (fp16) | Best quality | Apache 2.0 |

### Needs Paid GPU (A100/H100)

| Model | Task | Min VRAM | Quality |
|-------|------|----------|---------|
| **Wan 2.1 14B** | Text/Video-to-Video | 45-60 GB | Highest quality open video gen |
| **HunyuanVideo** | Video Generation | 45-60 GB | Outperforms Runway Gen-3 |
| **FLUX.1-dev** | Image Generation | ~12 GB+ | Best quality text-to-image |

### Key Breakthrough: FramePack

FramePack enables 13B video models on **6GB VRAM** by generating video progressively frame-by-frame. This changes what's possible on consumer hardware and free tiers.

### Source URLs
- Wan 2.1: https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B
- SAM 2: https://github.com/facebookresearch/segment-anything-2
- Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2
- IP-Adapter: https://github.com/tencent-ailab/IP-Adapter
- Whisper: https://huggingface.co/openai/whisper-large-v3
- FLUX.1: https://huggingface.co/black-forest-labs/FLUX.1-schnell
- FramePack: https://github.com/lllyasviel/FramePack
- CogVideoX: https://github.com/zai-org/CogVideo
- ControlNet: https://huggingface.co/lllyasviel/ControlNet-v1-1
- AnimateDiff: https://github.com/guoyww/AnimateDiff
- HunyuanVideo: https://github.com/Tencent-Hunyuan/HunyuanVideo

---

## 5. Free Infrastructure

### Cloudflare (Already Used in Monet)

| Service | Free Allowance | Monthly Value |
|---------|---------------|---------------|
| **Workers** | 100,000 requests/day, 10ms CPU/request | ~$5-10 |
| **R2** | 10GB storage, 1M writes, 10M reads, **unlimited egress** | ~$2-5 |
| **D1** | 5GB storage, 5M reads/day, 100K writes/day | ~$5-10 |
| **KV** | 1GB storage, 100K reads/day, 1K writes/day | ~$2-5 |
| **Queues** | 10K operations/day | ~$1 |
| **Durable Objects** | 100K requests/day, 5GB storage | ~$2-5 |
| **Pages** | Unlimited requests, 500 builds/month | ~$5 |

**Total Cloudflare free value: ~$20-50/month**

### Frontend Hosting

| Service | Free Allowance | Notes |
|---------|---------------|-------|
| **Vercel Hobby** | 1M edge requests, 100GB transfer, 4h CPU | Personal/non-commercial |
| **Deno Deploy** | 1M requests, 20GB egress, 15h CPU | Good for Deno/TS |
| **Cloudflare Pages** | Unlimited requests, 500 builds | Best for static sites |

### Database

| Service | Free Storage | Free Reads | Free Writes | Type | Notes |
|---------|-------------|------------|-------------|------|-------|
| **Cloudflare D1** | 5 GB | 5M/day | 100K/day | SQLite (edge) | Best for Cloudflare Workers |
| **Supabase** | 500 MB | Unlimited | Unlimited | Postgres | Full-featured; pauses after 1 week inactivity |
| **Neon** | 0.5 GB/project | 100 CU-hrs | 100 CU-hrs | Postgres (serverless) | Scale-to-zero |
| **MongoDB Atlas** | 512 MB | 100 ops/s | 100 ops/s | Document | Free forever |
| **Firebase Firestore** | 1 GiB | 50K/day | 20K/day | Document | Good free tier |

### Object Storage

| Service | Free Storage | Free Egress | Notes |
|---------|-------------|-------------|-------|
| **Cloudflare R2** | 10 GB | **Unlimited** | Best free tier (no egress ever) |
| **Supabase Storage** | 1 GB | 5 GB | Basic |
| **Firebase Storage** | 5 GB | 100 GB (new buckets) | Good |

### Video Storage & Delivery

| Service | Free Storage | Free Delivery | Notes |
|---------|-------------|---------------|-------|
| **Mux** | 10 videos | 100K delivery min/month | Best free video platform |
| **Cloudflare Stream** | None | None | Pay-as-you-go ($5/1K min stored) |
| **Bunny Stream** | None | None | Cheapest at scale ($0.01/GB) |

### Auth

| Service | Free MAUs | Notes |
|---------|-----------|-------|
| **Supabase Auth** | 50,000 | Full-featured |
| **Firebase Auth** | 50,000 | Industry standard |
| **Neon Auth** | 60,000 | New feature |

### Platform Compute

| Service | Free Allowance | Notes |
|---------|---------------|-------|
| **Supabase Edge Functions** | 500K invocations | Deno-based |
| **Firebase Cloud Functions** | NOT free on Spark (Blaze only) | 2M/month on Blaze |
| **Azure Functions** | 1M requests | Always free tier |

### Source URLs
- Cloudflare: https://developers.cloudflare.com/workers/platform/pricing/
- R2: https://developers.cloudflare.com/r2/pricing/
- D1: https://developers.cloudflare.com/d1/platform/pricing/
- KV: https://developers.cloudflare.com/kv/platform/pricing/
- Vercel: https://vercel.com/pricing
- Supabase: https://supabase.com/pricing
- Neon: https://neon.tech/pricing
- MongoDB Atlas: https://www.mongodb.com/pricing
- Firebase: https://firebase.google.com/pricing
- Mux: https://mux.com/pricing
- Deno Deploy: https://deno.com/pricing
- Bunny.net: https://bunny.net/pricing/

---

## 6. What Can Be Done Entirely Free

### Features That Run 100% on Free Tiers

| Feature | Free Solution | Monthly Cost |
|---------|--------------|-------------|
| **Audio Transcription** | Whisper on Colab/Kaggle or Groq free tier | $0 |
| **Scene Detection** | FFmpeg (CPU) on any server | $0 |
| **Beat Detection** | Librosa/Aubio (CPU) + Gemini API | $0 |
| **Object Segmentation** | SAM 2 on CPU | $0 |
| **Depth Estimation** | Depth Anything V2 on CPU | $0 |
| **Creative Reasoning (EDL)** | Gemini API (1M tokens/day) | $0 |
| **API Server** | Cloudflare Workers (100K req/day) | $0 |
| **Database** | Cloudflare D1 (5GB) or Supabase (500MB) | $0 |
| **File Storage** | Cloudflare R2 (10GB, no egress) | $0 |
| **Frontend Hosting** | Vercel Hobby or Cloudflare Pages | $0 |
| **User Authentication** | Supabase Auth (50K MAUs) | $0 |
| **Job Status** | Cloudflare KV (100K reads/day) | $0 |
| **CI/CD** | GitHub Actions (3,000 min/month) | $0 |
| **Dev Environment** | GitHub Codespaces (120 hrs/month) | $0 |
| **IDE** | JetBrains IDEs (student license) | $0 |
| **Monitoring** | Datadog Pro (2 years free via GitHub Pack) | $0 |

### Features That Need GPU but Can Be Batched

| Feature | Free GPU Solution | Limitations |
|---------|------------------|-------------|
| **Image Generation** | FLUX.1-schnell on Colab T4 | Slow, 1-4 steps only |
| **Video Generation** | Wan 2.1 1.3B on Colab T4 | 480P only, ~15-20 min per 5s clip |
| **Video Generation** | CogVideoX-5B on Colab T4 (INT8) | 480P, quantized |
| **Style Transfer** | IP-Adapter + SDXL on Colab T4 | ~8 GB VRAM, works |
| **Reference Analysis** | NVIDIA NIM ($1,000 credits) | Credits expire in 90 days |
| **Video Intelligence** | Google Cloud Video Intelligence ($300 credit) | Credits expire in 90 days |
| **Whisper (large-v3)** | Colab T4 or Groq free | Best quality transcription |

### Features That Are Impossible Without Paid Infrastructure

| Feature | Why | Workaround |
|---------|-----|-----------|
| **Real-time video preview** | Needs persistent GPU server | Use Canvas2D browser preview instead |
| **720P+ video generation** | Needs 45-60GB VRAM | Use 480P on free tier, or batch on Vast.ai ($0.03/hr) |
| **Production video hosting** | R2/Stream not enough for large video files | Use Mux free tier (10 videos) for demos |
| **High-volume concurrent users** | Free tiers have request limits | Scale to paid only when needed |
| **Long-form video editing** | GPU time exceeds free quotas | Use CPU-based processing + selective GPU |

---

## 7. Recommended Stack

### The Zero-Budget Stack

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND                                │
│  Vercel Hobby (free) or Cloudflare Pages (free)             │
│  TanStack Start / Next.js                                   │
│  Canvas2D preview (browser-side, no GPU needed)             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     API LAYER                                │
│  Cloudflare Workers (100K req/day free)                     │
│  Gemini API (creative reasoning, 1M tokens/day)             │
│  Groq (ultra-fast inference, Whisper STT)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     STORAGE                                  │
│  Cloudflare R2 (10GB, no egress) — uploads, thumbnails      │
│  Cloudflare D1 (5GB) — intents, EDLs, analyses              │
│  Cloudflare KV (1GB) — job status, sessions                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     GPU PROCESSING                           │
│  Google Colab (free T4, 4hr/day) — batch inference          │
│  Kaggle (30hr/week P100) — secondary batch processing       │
│  Modal ($30/mo free) — serverless inference endpoints        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     AI MODELS (Local/Free)                   │
│  Whisper — audio transcription (CPU or GPU)                 │
│  SAM 2 — object segmentation (CPU)                          │
│  Depth Anything V2 — depth maps (CPU)                       │
│  FLUX.1-schnell — image generation (Colab T4)               │
│  IP-Adapter — style transfer (Colab T4)                     │
│  FramePack — video generation (Colab T4, 6GB min)           │
└─────────────────────────────────────────────────────────────┘
```

### Total Free Budget Estimate

| Category | Service | Monthly Value |
|----------|---------|---------------|
| Compute | Cloudflare Workers | ~$5-10 |
| Storage | Cloudflare R2 | ~$2-5 |
| Database | Cloudflare D1 + Supabase | ~$15-25 |
| KV/Cache | Cloudflare KV | ~$2-5 |
| Auth | Supabase Auth | ~$5-10 |
| Video | Mux Free | ~$20-30 |
| Frontend | Vercel Hobby | ~$10-20 |
| GPU | Colab + Kaggle + Modal | ~$30-50 |
| APIs | Gemini + Groq + NVIDIA NIM | ~$50-100 |
| **TOTAL** | | **~$140-260/month equivalent** |

---

## 8. Key Gotchas

### Cloudflare Workers
- 10ms CPU per request on free tier — too short for heavy AI inference
- Use for routing/orchestration, not compute
- "10K requests/day" for Workers AI is actually "10,000 Neurons/day" — varies by model

### Colab
- No persistence — files lost on disconnect
- ~90 min idle timeout kills sessions
- GPU allocation not guaranteed during peak hours
- Not for production — notebook-only

### Kaggle
- P100 only on free tier (no T4, no A100)
- 30 GPU-hours/week cap (resets Monday UTC)
- 12-hour max per notebook run

### Supabase
- Projects pause after 1 week of inactivity on free tier
- Need a cron ping to keep alive
- 2 active projects max on free

### Cloudflare R2
- 10GB free is enough for metadata/thumbnails but not raw video footage
- Video files should be processed and deleted, not stored long-term

### NVIDIA NIM
- $1,000 credits expire in ~90 days
- Use them strategically for high-value tasks

### Modal
- $30/month credit runs out fast with GPU workloads
- T4 at ~$0.59/hr = ~51 GPU-hours/month

### Mux
- Only 10 stored videos on free tier — fine for demos, not production
- 100K delivery minutes/month is generous

### Gemini API
- Free tier is for "experimental/evaluation" use only
- Video understanding eats tokens fast
- No Imagen or Veo on free tier

### Student Programs
- GitHub Copilot new sign-ups temporarily paused
- Azure $100 credit requires age 18+
- AWS Educate provides labs, NOT free AWS credits
- Cloudflare has no dedicated student program

---

## Sources

All research verified against official documentation and pricing pages as of July 2026. Free tier details can change frequently — verify before building production dependencies.

### Primary Sources
- https://colab.research.google.com/
- https://www.kaggle.com/docs/notebooks
- https://modal.com/pricing
- https://huggingface.co/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://ai.google.dev/pricing
- https://groq.com/pricing/
- https://www.cerebras.ai/pricing
- https://build.nvidia.com/
- https://education.github.com/pack
- https://azure.microsoft.com/en-us/free/students/
- https://cloud.google.com/edu/students
- https://www.jetbrains.com/community/education/
- https://vercel.com/pricing
- https://supabase.com/pricing
- https://neon.tech/pricing
- https://mux.com/pricing
- https://firebase.google.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/kv/platform/pricing/

---

*This document is a living reference. Update as free tiers change or new programs become available.*
