<p align="center">
  <img src="apps/web/public/favicon.svg" width="80" alt="Jalebi Logo">
</p>

<h1 align="center">Jalebi</h1>

<p align="center">
  <strong>AI-powered video editing platform.</strong><br>
  Edit, grade, mix, and export — all in the browser. No uploads. No installs.
</p>

<p align="center">
  <a href="https://jalebi.video">Live App</a> · 
  <a href="https://jalebi.video/docs">Docs</a> · 
  <a href="https://github.com/Augani/jalebi-advanced/issues">Issues</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Status-Beta-orange" alt="Status">
  <img src="https://img.shields.io/badge/Stack-React%20%7C%20WebGPU%20%7C%20WebCodecs-blue" alt="Stack">
</p>

---

## What is Jalebi?

Jalebi is a browser-based video editor that combines professional-grade tools with AI assistance. It runs entirely client-side using WebGPU and WebCodecs — your videos never leave your device.

**Built for:**
- Content creators who need fast, professional edits
- Teams that want collaborative AI-assisted workflows
- Developers who need programmatic video generation via EDL pipelines

---

## Features

| Category | Capabilities |
|---|---|
| **Timeline** | Multi-track editing, drag-and-drop, ripple delete, snap, keyframes |
| **Video** | Cut, trim, split, transitions, speed ramps, crop, transform, blend modes |
| **Audio** | Multi-track mixing, EQ, reverb, compression, beat detection, ducking, noise reduction |
| **Color** | Wheels, HSL, curves, LUT support, built-in presets |
| **Text & Graphics** | Rich text, 20+ animations, shapes, SVG, stickers, karaoke subtitles |
| **Export** | MP4, WebM, ProRes, 4K, custom bitrate/codec, hardware encoding |
| **AI** | Beat sync, auto-refinement, EDL generation, noise reduction, background removal |
| **Performance** | WebGPU rendering, WebCodecs encoding, frame caching, web workers |

---

## Quick Start

### Cloud (Recommended)

Visit **[jalebi.video](https://jalebi.video)** — no setup required.

### Self-Host

```bash
git clone https://github.com/Augani/jalebi-advanced.git
cd jalebi-advanced

pnpm install

pnpm dev
# → http://localhost:5173
```

### Production Build

```bash
pnpm build
pnpm preview
```

---

## Architecture

```
jalebi-advanced/
├── apps/
│   ├── web/              # React frontend (editor UI)
│   │   └── src/
│   │       ├── components/editor/   # Timeline, Preview, Inspector panels
│   │       ├── stores/              # Zustand state management
│   │       ├── services/            # Auto-save, shortcuts, export
│   │       └── config/              # API endpoints, feature flags
│   └── api/              # Fastify server (FFmpeg, Blender, Python pipelines)
│
├── packages/
│   ├── core/             # Video/audio/graphics engines
│   │   └── src/
│   │       ├── video/    # WebGPU rendering, stabilization
│   │       ├── audio/    # Web Audio API, effects, beat detection
│   │       ├── graphics/ # Canvas/THREE.js, shapes, SVG
│   │       ├── text/     # Text rendering, animations
│   │       └── export/   # MP4/WebM encoding via WebCodecs
│   ├── edl/              # MonetEDL schema — the editing decision list format
│   └── kove-director/    # AI director — EDL generation, capability registry
│
└── infra/                # Transcription GPU worker, deployment configs
```

### Key Tech

- **React 18** + **TypeScript** — type-safe UI
- **Zustand** — lightweight state management
- **WebGPU** — GPU-accelerated compositing and rendering
- **WebCodecs** — hardware video encoding/decoding
- **Web Audio API** — professional audio processing
- **THREE.js** — 3D transforms and effects
- **IndexedDB** — local project storage
- **Cloudflare Workers** — edge API and AI inference
- **FFmpeg** — server-side video processing (self-hosted mode)

---

## Browser Support

| Browser | Version | Status |
|---|---|---|
| Chrome | 94+ | Full |
| Edge | 94+ | Full |
| Firefox | 130+ | Full |
| Safari | 16.4+ | Full |

**Recommended:** 8GB+ RAM, dedicated GPU for 4K, modern multi-core CPU.

---

## Development

```bash
pnpm install          # install deps
pnpm dev              # start dev server
pnpm typecheck        # type check
pnpm test             # run tests
pnpm lint             # lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## License

MIT — use freely for personal and commercial projects.
