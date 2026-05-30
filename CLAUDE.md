# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Monet** is an AI video editor with two interaction modes:
- **Chat**: Conversational video editing — describe what you want and get it
- **Studio**: Full timeline editor with manual control over every frame

The project is scaffolded with TanStack Start (React SSR framework) and will integrate **OpenReel Video** (an embedded monorepo at `/openreel-video/`) for the core video editing engine.

## Commands

### Main Application (TanStack Start)
```bash
# Development
bun dev              # Start dev server on http://localhost:3000

# Build & Preview
bun run build        # Production build
bun run build:dev    # Development build
bun preview          # Preview production build

# Linting & Formatting
bun lint             # Run ESLint
bun format           # Format with Prettier
```

### OpenReel Video Engine (Monorepo)
```bash
cd openreel-video

# Development
pnpm dev             # Start @openreel/web dev server

# Build
pnpm build:wasm      # Build WASM modules first
pnpm build           # Build WASM + web app

# Testing
pnpm test            # Run all tests once
pnpm test:watch      # Watch mode for tests
pnpm typecheck       # Type check all packages
pnpm lint            # Lint all packages
```

## Architecture

### Main App Structure
```
src/
├── routes/                      # TanStack Router file-based routes
│   ├── __root.tsx              # Root layout with QueryClient
│   ├── index.tsx               # Landing page (choose Chat or Studio)
│   ├── chat.tsx                # Chat thread list
│   ├── chat_.$threadId.tsx     # Chat conversation UI
│   ├── studio.tsx              # Studio project list
│   └── studio_.$projectId.tsx  # Studio timeline editor
├── components/ui/              # shadcn/ui components
├── lib/
│   ├── storage.ts              # LocalStorage hooks for chat/projects
│   └── utils.ts                # cn() and utilities
└── styles.css                  # Tailwind CSS
```

### Key Design Patterns

**File-based Routing**: TanStack Router uses file names for routes
- `routes/index.tsx` → `/`
- `routes/chat_.$threadId.tsx` → `/chat/:threadId`
- `routes/studio_.$projectId.tsx` → `/studio/:projectId`

**State Management**:
- Client state: React hooks + TanStack Query
- Persistence: LocalStorage via custom hooks (`useChatThreads`, `useStudioProjects`)
- No Zustand/Redux — keeping it simple until OpenReel integration

**OpenReel Integration** (in `/openreel-video/`):
- Monorepo with `apps/web` (React editor) and `packages/core` (video engine)
- Core engines: video processing (WebCodecs), audio (Web Audio API), graphics (Canvas/THREE.js)
- Storage via IndexedDB for projects (not yet wired to main app)
- **Action-based editing**: All edits are undoable actions (immutable state)

### Deployment

- **Target**: Cloudflare Pages (SSR via Workers)
- **Config**: `wrangler.jsonc` specifies `src/server.ts` as entry point
- **Build**: Vite builds using `@lovable.dev/vite-tanstack-config` (includes all necessary plugins)

## Styling

- **Framework**: Tailwind CSS 4.2 with `@tailwindcss/vite`
- **Components**: shadcn/ui (Radix UI primitives)
- **Theme**: Custom design system
  - Primary accent color for AI features
  - Serif font (Instrument Serif) for headings
  - Sans font (Inter) for body text
- **Utility**: `cn()` from `lib/utils.ts` for conditional class merging

## Important Notes

### Vite Configuration
Do NOT manually add these plugins to `vite.config.ts` (already included in `@lovable.dev/vite-tanstack-config`):
- TanStack Start
- React
- Tailwind CSS
- tsconfig paths
- Cloudflare adapter

### OpenReel Video
- The `/openreel-video/` directory is a full monorepo (130k+ lines)
- Uses `pnpm` for package management (main app uses `bun`)
- When integrating, import from `@openreel/core` (video engine) or `@openreel/web` (React components)
- Requires WebCodecs and WebGPU — Chrome/Edge 94+ recommended

### Storage
- **Chat threads**: Stored in localStorage under key `monet.chat.threads.v1`
- **Studio projects**: Not yet implemented (will use OpenReel's IndexedDB)
- All IDs use `crypto.randomUUID()` via `cryptoId()` helper

### Type Safety
- Strict TypeScript enabled
- Path alias: `@/*` maps to `src/*`
- Module resolution: `Bundler` mode (no file extensions needed)

## Testing

Currently no tests in main app. OpenReel has extensive tests:
```bash
cd openreel-video
pnpm test                                    # All tests
pnpm --filter @openreel/core test          # Core engine tests only
pnpm --filter @openreel/web test           # Web app tests only
```

## Development Workflow

1. **Main app changes**: Use `bun dev` and edit files in `src/`
2. **Video engine changes**: `cd openreel-video && pnpm dev`
3. **Integration work**: May need both dev servers running
4. **Before committing**: Run `bun lint` and `bun format`

## Future Work

- Wire up OpenReel video engine to Studio UI
- Implement actual AI chat backend (currently mock responses)
- Add video upload/import flows
- Connect Studio projects to OpenReel's IndexedDB storage
- Deploy to Cloudflare Pages
