# Kove: From Pitch to Product — Execution Plan

> **The pitch**: Kove is an AI video director, not an editor. It clones taste, not style. It's built for the cut, not the timeline. It talks back. It's for people who cut to music — sports highlights, gaming montages, anime edits, hype reels. First, best, before anything else.
>
> **The moat**: Reference video style cloning (editing DNA transfer). No competitor does this.
>
> **The demo**: Upload footage + music → paste a YouTube reference → get a beat-synced edit that clones the reference's editing DNA → open in a full NLE to fine-tune → AI learns from your changes.

---

## Table of Contents

1. [What We're Building](#what-were-building)
2. [The Competitive Landscape](#the-competitive-landscape)
3. [What Exists Today](#what-exists-today)
4. [The Strategy](#the-strategy)
5. [Phase 1: Kill the Complexity (Week 1)](#phase-1-kill-the-complexity-week-1)
6. [Phase 2: Ship the MVP (Week 2-3)](#phase-2-ship-the-mvp-week-2-3)
7. [Phase 3: Launch (Week 4)](#phase-3-launch-week-4)
8. [Phase 4: Iterate (Week 5+)](#phase-4-iterate-week-5)
9. [Technical Architecture](#technical-architecture)
10. [MVP Scope](#mvp-scope)
11. [Success Metrics](#success-metrics)
12. [The Timeline](#the-timeline)

---

## What We're Building

Kove is two things in one product:

1. **An AI Video Director** — you describe the edit, the AI cuts it. Upload footage + music, paste a YouTube reference, get a beat-synced edit. Refine conversationally ("make it hit harder on the drop"). The AI watches your footage, listens to your music, understands rhythm and pacing the way a human editor would.

2. **A Professional NLE** — when the AI gets it 90% right but you want it 100%, you open Kove Advanced — a full non-linear editor with multi-track timeline, keyframe animation, color grading, effects, transitions, and professional export. The AI's edit is loaded into the timeline. You refine it. The AI learns from your changes.

**The flow**:
```
Upload footage + music
        ↓
AI generates initial edit (chat UI)
        ↓
┌─────────────────────────────┐
│  Want to fine-tune?         │
│  → Open in Kove Advanced    │
│  (full NLE timeline)        │
│                             │
│  Trim clips, adjust         │
│  transitions, color grade   │
│                             │
│  "Back to AI"               │
│  → AI learns your style     │
└─────────────────────────────┘
        ↓
Export professional-quality MP4
```

**Nobody else has this loop.** AI generates, you refine, AI learns.

---

## The Competitive Landscape

### Who's Out There

| Company | Funding | What They Do | Users | Weakness |
|---|---|---|---|---|
| **Eddie AI** | Well-funded | Rough cuts, A&B roll logging, multicam. Desktop app. Exports to Premiere/Resolve/FCP. | 50K+ | Targets documentary editors, not music-cut creators. No NLE. |
| **Descript** | $101M, $550M val | Transcript-based editing, Underlord AI. | $55M ARR | Targets podcasters. No beat sync. No style cloning. |
| **CapCut** | ByteDance | Free tier. 1B+ downloads. Google Gemini integration. | Massive | Templates, not AI direction. No reference cloning. |
| **OpusClip** | Funded | Auto-shorts from long videos. | Established | Repurposing, not creative editing. |
| **Vizard** | Funded | Agentic repurposing. | Established | Social clips, not music-cut edits. |
| **Adobe Premiere** | Adobe | 35% market share. Adding AI features. | Dominant | AI is an add-on, not the core. |
| **DaVinci Resolve** | Blackmagic | Free professional suite. 300% user surge. | Growing fast | No AI direction. |

### What Makes Kove Different

1. **Reference style cloning** — paste a YouTube URL, the AI extracts editing DNA (cut rhythm, shot selection, color language, effects philosophy) and replicates it. Nobody else does this.

2. **Built for the cut, not the timeline** — Descript is built around transcripts. CapCut is built around templates. Premiere is built around a timeline a human drags clips along. Kove is built around the actual unit that matters in a great edit — the cut itself, synced to a beat, carrying emotional weight.

3. **AI generates, you refine, AI learns** — the round-trip between the AI director and the professional NLE is the product. No other tool has this loop.

4. **Niche focus** — sports highlights, gaming montages, anime edits, hype reels. The tools with more money are building for everyone, which means built well for no one. Kove is built to be undeniably the best at one specific kind of edit.

---

## What Exists Today

### What's Working

| Component | Lines | Status | What It Does |
|---|---|---|---|
| Chat UI | 1,284 | Working | The main AI director interface — upload, describe, generate, refine |
| Landing Page | 663 | Working | Polished marketing page with animations, feature grid, CTAs |
| Reference Analysis | 1,318 | Working (local) | Extracts editing DNA from reference videos |
| EDL Generation | Full pipeline | Working | Two-pass architecture: LLM creative skeleton + deterministic timing planner |
| Beat Sync Scoring | Working | Working | % shots within 50ms of beat grid, target >80% |
| Conversational Refinement | Working | Working | "Make it hit harder" → updated EDL in <3 seconds |
| Kove Advanced (NLE) | 130,000+ | Working | Full professional NLE — timeline, keyframes, effects, transitions, export |
| EDL Round-Trip | Working | Working | AI → NLE → AI conversion without data loss |
| Python Audio Worker | Port 8101 | Working | Beat detection, energy analysis, onset detection |
| Python AI Worker | Port 8102 | Working | Whisper transcription, subject tracking, spatial analysis |
| Cloudflare Worker Config | wrangler.jsonc | Ready | R2, D1, KV, Queues, Workers AI — all configured |
| Clerk Auth Middleware | 259 lines | Ready (no frontend) | JWT verification, session cookies, protected routes |

### What's Broken

| Component | Problem | Fix |
|---|---|---|
| Three codebases | v1 (src/), v2 (apps/api/), Kove Advanced (apps/kove-advanced/) | Kill v2, keep v1 + Kove Advanced |
| Reference cloning portability | Calls Python via execFile — won't work in Cloudflare Workers | Move to HTTP endpoint on Python worker |
| Auth frontend | Middleware exists, no login UI | Add ClerkProvider + sign-in/sign-up pages |
| Billing | Not implemented | Add Stripe (free tier for MVP) |
| CI/CD | No build/test/deploy pipelines | Add GitHub Actions |
| Landing page CTAs | Buttons have no click handlers | Wire to sign-up flow |
| Chat UI debug code | window.__monetStore, @ts-ignore, alert() for errors | Clean up for production |
| Legacy Python app | Root Dockerfile/docker-compose target old monet/ app | Delete |

### What Needs to Die

- `apps/api/` (Fastify v2) — duplicate of v1, merge unique features
- Root `Dockerfile` and `docker-compose.yml` — legacy Python app
- Incomplete Python workers (director, content analyzer, music analyzer) — no entry points
- `apps/kove-advanced/` OpenReel branding — rebrand to Kove

---

## The Strategy

**One product. Two surfaces. One codebase. One use case.**

- **Surface 1: Chat UI** — the AI director. Upload footage + music, describe what you want, get an edit. This is where 80% of users will live.
- **Surface 2: Kove Advanced** — the professional NLE. For when you want to fine-tune the AI's edit manually. This is where power users will live.
- **The bridge**: EDL round-trip. AI generates → you refine → AI learns.

**The use case**: People who cut to music. Sports highlights. Gaming montages. Anime edits. Hype reels. Not podcasts. Not interviews. Not social clips. Music-cut edits, first, best, before anything else.

---

## Phase 1: Kill the Complexity (Week 1)

### 1.1 Consolidate to One Codebase

**Keep**:
- `src/` — v1 Cloudflare Worker (the API)
- `apps/web/src/` — shared stores, pipeline logic, UI components
- `apps/kove-advanced/` — the professional NLE
- `packages/edl/` — EDL schema and validators
- `packages/edl-enhancers/` — EDL post-processing
- `packages/kove-director/` — AI director contract
- `packages/openreel-adapter/` — EDL ↔ OpenReel conversion
- `infra/docker-compose.yml` — Python workers

**Kill**:
- `apps/api/` — Fastify v2 (duplicate). Merge any unique features (spatial analysis endpoints) into v1
- Root `Dockerfile` and `docker-compose.yml` — legacy Python app
- `workers/python-director/` — no entry point, incomplete
- `workers/python-content-analyzer/` — no visible entry point
- `workers/python-music-analyzer/` — no visible entry point

**Merge**:
- Any unique v2 features (subject tracking endpoints, spatial analysis) → new routes in v1 Worker

### 1.2 Fix Reference Cloning for Cloudflare Workers

**Problem**: `src/server/services/reference-analysis-service.ts` calls Python via `execFile` using hardcoded venv paths (`.venv/bin/python3`). This works in local Node.js but won't work in Cloudflare Workers (no filesystem).

**Solution**: Create a new Python worker endpoint `POST /analyze-reference` in `workers/python-ai/`.

The v1 Worker calls this endpoint via HTTP (same pattern as existing audio analysis calls). The Python worker handles:
- Scene detection
- Energy analysis
- Effect vocabulary extraction
- Color grade extraction
- Velocity ramp detection
- Rhythm analysis
- Camera motion classification

The Worker receives the structured `ReferenceStyle` object back and stores it in D1.

**Files to change**:
- `workers/python-ai/app.py` — add `POST /analyze-reference` route
- `workers/python-ai/workers/reference_analyzer.py` — new module (extract from reference-analysis-service.ts)
- `src/server/services/reference-analysis-service.ts` — replace execFile calls with HTTP fetch to Python worker
- `src/server/types/env.ts` — add `PYTHON_AI_URL` env var

### 1.3 Wire Auth Frontend

**What exists**: Full Clerk middleware at `src/server/middleware/clerk-auth.ts` (259 lines). JWT verification, session cookies, protected route registry. But no frontend login UI.

**What to build**:
1. Add `@clerk/clerk-react` to the app
2. Wrap the app root in `<ClerkProvider>`
3. Create sign-in page at `/sign-in` (Clerk's `<SignIn />` component)
4. Create sign-up page at `/sign-up` (Clerk's `<SignUp />` component)
5. Wire the protected route enforcement (middleware exists but doesn't check `PROTECTED_ROUTES`)
6. Add user avatar/menu to the chat UI header

**Files to change**:
- `src/routes/__root.tsx` — wrap in `<ClerkProvider>`
- `src/routes/sign-in.$.tsx` — new file, Clerk sign-in
- `src/routes/sign-up.$.tsx` — new file, Clerk sign-up
- `src/server/middleware/clerk-auth.ts` — enforce PROTECTED_ROUTES
- `src/routes/chat_.$threadId.tsx` — add user avatar/menu

### 1.4 Wire Billing (Free Tier for MVP)

**Pricing**:
- **Free**: 5 edits/month, 720p export, chat UI only
- **Pro** ($19/mo): Unlimited edits, 4K export, Kove Advanced access, priority rendering

**Implementation**:
1. Add `stripe` dependency
2. Create `src/server/api/billing/checkout.ts` — Stripe Checkout session creation
3. Create `src/server/api/billing/webhook.ts` — handle subscription events
4. Create `src/routes/pricing.tsx` — pricing page
5. Add usage tracking to D1 (edits count per user per month)
6. Gate features based on subscription status

**Files to create**:
- `src/server/api/billing/checkout.ts`
- `src/server/api/billing/webhook.ts`
- `src/server/api/billing/usage.ts`
- `src/routes/pricing.tsx`

**Files to change**:
- `src/server.ts` — add billing routes
- `wrangler.jsonc` — add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET env vars

### 1.5 Add CI/CD

**GitHub Actions workflow** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-test-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm lint
      - name: Deploy to Cloudflare
        if: github.ref == 'refs/heads/main'
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

**Branch protection**:
- Require PR reviews
- Require status checks (build, test, lint)
- Require up-to-date branches

---

## Phase 2: Ship the MVP (Week 2-3)

### 2.1 Deploy to Production

**Cloudflare**:
- Deploy v1 Worker: `wrangler deploy`
- Deploy Kove Advanced: `wrangler pages deploy dist --project-name=kove-advanced`
- Deploy Landing Page: `wrangler pages deploy dist --project-name=kove`

**VPS (Hetzner/Railway/Fly.io)**:
- Deploy Python audio worker (:8101)
- Deploy Python AI worker (:8102)
- Deploy Redis (for BullMQ job queues)

**Environment variables**:
- `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `PYTHON_AUDIO_URL` / `PYTHON_AI_URL`
- R2/D1/KV bindings (via wrangler)

### 2.2 Polish the Chat UI

**Remove debug code**:
- Delete `window.__monetStore` assignment (line ~39)
- Remove `@ts-ignore` comments (line ~70)
- Remove any console.log statements

**Fix error UX**:
- Replace `alert()` calls with toast notifications (use `sonner` or `react-hot-toast`)
- Add error boundaries for critical components
- Add retry logic for failed API calls

**Add loading states**:
- Skeleton loaders for the preview panel
- Progress indicators for generation stages (intent → analysis → EDL → complete)
- Spinner for export progress

**Make responsive**:
- Mobile-friendly preview panel
- Collapsible sidebar on small screens
- Touch-friendly controls

**Add onboarding**:
- First-time user tooltip tour
- "How it works" modal on first visit
- Example prompts to get started

### 2.3 Polish Kove Advanced

**Rebrand**:
- Replace "OpenReel" references with "Kove"
- Update wrangler.toml project name
- Update package.json name/description

**EDL round-trip polish**:
- Add a "Back to AI" button in the NLE toolbar
- When clicked, convert the current timeline to EDL and send to the AI director
- Show a "What changed?" summary when the AI receives the refined EDL
- Add a "Your style is improving" message after 3+ round-trips

**Integration with chat UI**:
- "Open in Kove Advanced" button in the chat UI passes EDL via URL params or shared state
- Kove Advanced loads the EDL and displays it in the timeline
- When the user saves in Kove Advanced, the chat UI updates with the refined EDL

### 2.4 Polish the Landing Page

**Wire CTAs**:
- "Get Early Access" → `/sign-up`
- "Join the Beta" → `/sign-up`
- "See it in action" → demo video

**Replace localhost iframe**:
- Change `http://localhost:5173` to production Kove Advanced URL
- Or replace with a static screenshot/animation if iframe is too heavy

**Add analytics**:
- Plausible (privacy-friendly) or PostHog (product analytics)
- Track: page views, sign-ups, feature clicks

**Add real social links**:
- Twitter/X: @koveai (or whatever the handle is)
- Discord: create a community server
- GitHub: link to the repo

**Add demo video**:
- 30-second loop showing the core flow
- Autoplay on mute, click to unmute

### 2.5 Create the Viral Demo

**The demo has TWO parts (60 seconds total)**:

**Part 1: The AI Director (30s)**
1. Screen recording: user drops 3 video clips + 1 music track into the chat UI
2. User pastes a YouTube URL (a popular AMV edit)
3. User types: "30s anime AMV, hit hard on the drop, match the reference"
4. AI generates a beat-synced edit (show the preview playing)
5. User types: "make it hit harder on the drop"
6. AI rebuilds the edit (show the refined version)
7. Text overlay: "AI generates the edit."

**Part 2: The Professional NLE (30s)**
1. User clicks "Open in Kove Advanced"
2. Full NLE timeline appears with the AI's edit loaded
3. User trims a clip by dragging the edge
4. User adjusts a transition (dissolve → wipe)
5. User changes a color grade (cool → warm)
6. User clicks "Back to AI"
7. Text overlay: "You refine it. AI learns."
8. Export MP4
9. Text overlay: "Kove. The AI Video Director."

**Production**:
- Record with OBS or ScreenFlow
- Use actual footage (anime clips, gaming clips, sports clips)
- Use actual music (copyright-free or licensed)
- Add text overlays in post
- Export as 1080p MP4

---

## Phase 3: Launch (Week 4)

### 3.1 Product Hunt Launch

**Preparation** (1 week before):
- Create Product Hunt maker account
- Find a hunter (someone with followers who can submit the product)
- Prepare gallery images (6 screenshots):
  1. Chat UI with footage uploaded
  2. AI generating the edit
  3. Preview playing the beat-synced edit
  4. Conversational refinement
  5. Kove Advanced NLE timeline
  6. Export dialog
- Write maker comment
- Prepare the demo video

**Launch day**:
- Title: "Kove — The AI Video Director"
- Tagline: "AI generates the edit. You refine it. AI learns."
- Description: Explain the vision (AI director, not editor). Reference the a16z thesis on agentic video editing.
- Gallery: 6 screenshots
- Video: 60-second two-part demo
- Topics: Video Editing, Artificial Intelligence, Productivity

**Post-launch**:
- Respond to every comment
- Share on Twitter/X
- Share in communities
- Track upvotes and rank

### 3.2 Twitter/X Launch

**The thread** (posted on launch day):

```
1/ I built an AI that clones editing taste — not just style.

It watches your footage, listens to your music, and cuts a beat-synced edit that matches any reference video you give it.

Here's how it works 🧵

2/ The problem: every AI video tool bolts AI onto an editor. You still do the editing. The AI just makes the software easier to operate.

Kove flips that. You describe the edit. Kove directs it.

3/ The secret: reference style cloning.

Paste any YouTube link — an AMV, a gaming montage, a sports highlight — and Kove extracts its editing DNA:
- Cut rhythm
- Shot selection logic
- Color language
- Effects philosophy

Then applies that DNA to your footage.

4/ But here's what makes it truly powerful:

When the AI gets it 90% right, you open Kove Advanced — a full professional NLE — and fine-tune the edit manually.

The AI learns from your changes. Next time, it gets it right.

5/ The flow:
→ Upload footage + music
→ Paste a YouTube reference
→ AI generates a beat-synced edit
→ "Make it hit harder on the drop"
→ Open in Kove Advanced to refine
→ AI learns your style
→ Export professional MP4

6/ Nobody else has this loop.

Eddie AI exports to Premiere. Descript edits transcripts. CapCut uses templates.

Kove generates, you refine, AI learns.

7/ Built for people who cut to music:
- Sports highlights
- Gaming montages
- Anime edits
- Hype reels

Not podcasts. Not interviews. Music-cut edits, first, best, before anything else.

8/ We're live on @ProductHunt today.

Drop your footage. Paste a reference. Get a beat-synced edit.

🔗 [link]

#AI #VideoEditing #ProductHunt
```

### 3.3 Community Seeding

**Anime editing communities**:
- r/AMV (Reddit)
- r/AnimeVideoCreator (Reddit)
- AMV Discord servers (search "AMV community Discord")
- MyAnimeList forums

**Gaming montage communities**:
- r/gaming (Reddit)
- r/fragmovies (Reddit)
- r/overwatch_university (for OW montages)
- Gaming montage Discord servers

**Sports highlights communities**:
- r/sports (Reddit)
- r/nfl, r/nba, r/soccer (Reddit)
- Sports editing Discord servers

**AI video communities**:
- r/VideoEditing (Reddit)
- r/artificial (Reddit)
- AI video Twitter community
- a16z portfolio companies

**Approach**: Don't spam. Share genuinely. "I built this tool for people like us. Here's what it does. Would love feedback."

### 3.4 YouTube Launch

**Video**: "I Built an AI Video Director — It Clones Any Edit's Style" (5-8 minutes)

**Structure**:
1. Hook (0:00-0:30): "What if you could paste any YouTube link and have an AI clone its editing style for your footage?"
2. Problem (0:30-1:30): Current AI video tools bolt AI onto editors. You still need editing skill.
3. Demo (1:30-4:00): Show the full flow — upload, reference, generate, refine, NLE, export
4. How it works (4:00-5:30): Reference style cloning, beat sync, EDL round-trip
5. CTA (5:30-6:00): "Link in description. Free to try."

**SEO**:
- Title: "I Built an AI Video Director — It Clones Any Edit's Style"
- Tags: AI video editor, AI video director, beat sync editor, AMV editor, AI editing
- Description: Link to Kove, explain the features

---

## Phase 4: Iterate (Week 5+)

### 4.1 User Feedback Loop

- Add a feedback widget (Canny or in-app feedback button)
- Monitor analytics: where do users drop off?
- Priority fixes based on actual usage
- Weekly changelog updates

### 4.2 Feature Roadmap (Post-MVP)

**v1.1 — Text-Based Editing** (Week 5-6)
- Word-level transcription via Whisper
- Clickable text timeline
- Delete words to splice the EDL
- Kinetic typography mode
- This is the "viral/screen-recordable" feature

**v1.2 — More Edit Types** (Week 7-8)
- Narrative mode (story-driven cuts)
- Cinematic mode (slow, deliberate pacing)
- Chill vlog mode (relaxed, natural cuts)
- User can define custom tempo modes

**v1.3 — Team Features** (Week 9-10)
- Shared projects (invite collaborators)
- Comments on the timeline
- Version history
- Role-based access (viewer, editor, admin)

**v2.0 — Mobile Experience** (Week 11-14)
- Responsive chat UI
- Touch-friendly NLE (simplified timeline)
- Mobile export (optimized for phone storage)
- Share to social media directly

**v2.1 — Advanced Effects** (Week 15-18)
- Subject tracking (SAM2 integration — already implemented)
- Background removal and replacement
- Color grading presets (cinematic, vintage, neon, etc.)
- Custom LUT import

**v2.2 — NLE Integrations** (Week 19-22)
- Export to Premiere Pro (XML)
- Export to DaVinci Resolve (XML)
- Export to Final Cut Pro (XML)
- Import from Premiere/Resolve/FCP

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Landing Page  │  │   Chat UI    │  │  Kove Advanced    │ │
│  │  (Pages)      │  │  (Pages)     │  │    (Pages)        │ │
│  │  kove.pages   │  │  app.kove    │  │  edit.kove        │ │
│  └──────────────┘  └──────┬───────┘  └─────────┬─────────┘ │
│                            │                     │           │
│                     ┌──────┴───────┐             │           │
│                     │  EDL Bridge  │←────────────┘           │
│                     │  (round-trip)│                         │
│                     └──────┬───────┘                         │
│                            │                                 │
│                     ┌──────┴───────┐                         │
│                     │   Worker     │                         │
│                     │   (API)      │                         │
│                     │  api.kove    │                         │
│                     └──────┬───────┘                         │
│                            │                                 │
│  ┌──────────────┐  ┌──────┴───────┐  ┌───────────────────┐ │
│  │      R2      │  │      D1      │  │        KV         │ │
│  │  (media)     │  │  (metadata)  │  │    (sessions)     │ │
│  │  clips, refs │  │  EDLs, styles│  │    auth, cache    │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└──────────────────────────────────────────┼───────────────────┘
                                           │
                    ┌──────────────────────┼───────────────────┐
                    │             VPS / FLY.IO                  │
                    │                                           │
                    │  ┌──────────────┐  ┌──────────────────┐ │
                    │  │ python-audio │  │    python-ai     │ │
                    │  │   (:8101)    │  │     (:8102)      │ │
                    │  │  beat det.   │  │  whisper, track  │ │
                    │  │  energy      │  │  reference clone │ │
                    │  │  onset       │  │  spatial analysis│ │
                    │  └──────────────┘  └──────────────────┘ │
                    │                                           │
                    │  ┌──────────────┐                        │
                    │  │    Redis     │                        │
                    │  │  (BullMQ)    │                        │
                    │  │  render jobs │                        │
                    │  └──────────────┘                        │
                    └───────────────────────────────────────────┘
```

### Data Flow

```
User uploads footage + music
        ↓
Worker uploads to R2
        ↓
Worker calls Python audio worker (beat detection, energy analysis)
        ↓
Worker calls Python AI worker (scene detection, frame analysis)
        ↓
Worker calls Gemini (intent extraction, EDL generation)
        ↓
Worker stores EDL in D1
        ↓
Chat UI loads EDL, renders preview via Canvas2D
        ↓
User refines conversationally → Worker regenerates EDL
        ↓
User clicks "Open in Kove Advanced" → EDL loaded into NLE timeline
        ↓
User edits in NLE → EDL updated
        ↓
User clicks "Back to AI" → Refined EDL sent to Worker → AI learns
        ↓
User exports → MP4 via WebCodecs (client) or FFmpeg (server)
```

---

## MVP Scope

### What Ships

| Feature | Status | MVP? | Why |
|---|---|---|---|
| Chat UI (AI Director) | Working | ✅ | The product |
| Kove Advanced (NLE) | Working (130k lines) | ✅ | Professional refinement |
| EDL round-trip | Working | ✅ | AI ↔ NLE bridge |
| Reference cloning | Working (local) | ✅ | The moat |
| EDL generation | Working | ✅ | Core pipeline |
| Beat sync scoring | Working | ✅ | Quality metric |
| Conversational refinement | Working | ✅ | AI learns |
| MP4 export | Working (NLE) | ✅ | The output |
| Auth (Clerk) | Middleware only | ✅ | Required for production |
| Billing (Stripe) | Not started | ✅ (free tier) | Required for production |
| CI/CD | Not started | ✅ | Required for deployment |
| Landing page | Working | ✅ | Marketing |

### What Doesn't Ship (Post-MVP)

| Feature | Status | Why Post-MVP |
|---|---|---|
| Text-based editing | Working | v1.1 feature |
| Subject tracking | Implemented | v2.1 feature |
| Mobile experience | Not started | v2.0 feature |
| Team features | Not started | v1.3 feature |
| NLE integrations | Not started | v2.2 feature |
| 86-capability director | Partially wired | Post-MVP |
| Advanced effects | Partially implemented | v2.1 feature |

---

## Success Metrics (30 Days Post-Launch)

| Metric | Target | Why It Matters |
|---|---|---|
| Product Hunt upvotes | 500+ | Visibility and social proof |
| Product Hunt rank | Top 5 of the day | Discovery |
| Twitter thread impressions | 100K+ | Awareness |
| Website visitors | 10K+ | Top of funnel |
| Sign-ups | 1K+ | Users |
| Active users (weekly) | 100+ | Retention |
| Edits generated | 500+ | Product usage |
| Edits refined in NLE | 200+ (40%) | AI ↔ NLE loop working |
| NPS score | 50+ | Satisfaction |
| Time to first edit | <5 minutes | Onboarding quality |

---

## The Timeline

| Week | Focus | Deliverables |
|---|---|---|
| **Week 1** | Kill complexity, wire auth, fix reference cloning, wire billing | One codebase, auth UI, reference analysis via HTTP, Stripe free tier, CI/CD |
| **Week 2** | Deploy, polish chat UI, polish Kove Advanced | Production deployment, working MVP |
| **Week 3** | Create viral demo, prepare launch assets | 60-second demo video, Product Hunt gallery, Twitter thread, YouTube video |
| **Week 4** | Launch on Product Hunt, Twitter, communities | Live product, public launch |
| **Week 5+** | Iterate based on feedback | v1.1 text-based editing, more edit types, team features |

---

## The One Thing That Matters

**Ship the demo.**

The 60-second video showing:

**Part 1**: Drop footage + music → paste YouTube reference → AI generates beat-synced edit → "make it hit harder" → refined edit.

**Part 2**: Open in Kove Advanced → full NLE timeline → user trims a clip, adjusts a transition → "Back to AI" → AI learns → export.

That's the product. That's the marketing. That's the moat.

AI generates. You refine. AI learns. Nobody else has this loop.

**Ship it. Now.**
