# Jalebi Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Kove landing page with a Jalebi-branded landing page featuring a scrubbable hero preview, filmstrip design language, and jalebi-amber accent system.

**Architecture:** Single landing page component tree under `/components/landing/`, rendered by the existing `src/routes/landing.tsx` route. All animations are pure CSS (no framer-motion). Scroll entry uses IntersectionObserver + CSS class toggles. The scrubbable preview uses a hidden `<input type="range">` driving frame swaps from a preloaded array.

**Tech Stack:** TanStack Start, Tailwind CSS v4 (`@theme inline` tokens), CSS animations, IntersectionObserver API, React state (useState/useRef/useEffect).

---

## Global Constraints

- No framer-motion — all animations via CSS keyframes + Tailwind utility classes
- Tailwind v4 syntax: tokens registered in `@theme inline {}` in `src/styles.css`
- Design tokens from spec override existing tokens where they conflict (the Jalebi amber-orange palette replaces Kove orange)
- 8px spacing scale: 8/16/24/32/48/64/96/128
- Section vertical padding: 128px desktop, 64px mobile
- Font: Inter for body (already loaded), Space Grotesk for headlines (already loaded)
- All interactive elements need visible focus states (`--accent` outline, 2px, offset 2px)
- `prefers-reduced-motion` disables decorative animations
- Radius: cards 16px, buttons pills (9999px), inputs 12px, thumbnails 12px

---

## File Structure

```
src/styles.css                          — add Jalebi design tokens to @theme inline
src/routes/landing.tsx                  — replace with new landing page composition
src/components/landing/
  Nav.tsx                               — sticky glassmorphism nav
  Hero.tsx                              — headline, toggle, preview, CTAs
  EditorToggle.tsx                      — Simple/Advanced pill switcher
  ScrubbablePreview.tsx                 — frame-array scrubber with autoplay
  TryItNow.tsx                          — upload/paste input band
  SocialProofMarquee.tsx                — auto-scrolling clip thumbnails
  FeatureSplit.tsx                      — Simple vs Advanced two-column
  Pricing.tsx                           — three-tier pricing cards
  FinalCTA.tsx                          — closing CTA section
  Footer.tsx                            — standard footer
  shared/FilmstripBorder.tsx            — reusable filmstrip border component
  shared/useScrollReveal.ts             — IntersectionObserver hook for section entry
```

---

## Task 1: Design Tokens + CSS Foundation

**Files:**
- Modify: `src/styles.css` — add Jalebi tokens to `@theme inline {}`

**Interfaces:**
- Consumes: existing `@theme inline` block in `src/styles.css` (line ~36)
- Produces: new CSS custom properties usable as Tailwind utilities (e.g., `bg-jalebi`, `text-jalebi`)

- [ ] **Step 1: Read the current @theme inline block**

Read `src/styles.css` from the `@theme inline {` line through its closing `}`. Identify where to insert new tokens.

- [ ] **Step 2: Add Jalebi color tokens**

Insert after the existing `--color-*` tokens inside `@theme inline`:

```css
    /* Jalebi brand palette */
    --color-jalebi-bg: #0a0a0b;
    --color-jalebi-surface: #131316;
    --color-jalebi-surface-2: #1a1a1d;
    --color-jalebi-accent: #ff8a3d;
    --color-jalebi-accent-hover: #ff9d5c;
    --color-jalebi-accent-muted: rgba(255,138,61,0.12);
    --color-jalebi-positive: #34d399;
    --color-jalebi-negative: #ff5c5c;
    --color-jalebi-border: rgba(255,255,255,0.08);
    --color-jalebi-border-strong: rgba(255,255,255,0.14);
```

- [ ] **Step 3: Add filmstrip border utility class**

Add to the `@layer utilities` section in `src/styles.css`:

```css
  .filmstrip-border {
    height: 3px;
    background: repeating-linear-gradient(
      90deg,
      var(--color-jalebi-accent) 0px,
      var(--color-jalebi-accent) 2px,
      transparent 2px,
      transparent 8px
    );
    opacity: 0.4;
  }
```

- [ ] **Step 4: Add scroll-reveal utility class**

Add to the `@layer utilities` section:

```css
  .reveal {
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 100ms ease-out, transform 100ms ease-out;
  }

  .reveal.visible {
    opacity: 1;
    transform: translateY(0);
  }
```

- [ ] **Step 5: Verify Tailwind compiles**

Run `pnpm dev` and confirm no CSS build errors. The new tokens should be usable as `bg-jalebi-bg`, `text-jalebi-accent`, etc.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "feat(landing): add Jalebi design tokens and filmstrip utilities"
```

---

## Task 2: Scroll Reveal Hook + FilmstripBorder Component

**Files:**
- Create: `src/components/landing/shared/useScrollReveal.ts`
- Create: `src/components/landing/shared/FilmstripBorder.tsx`

**Interfaces:**
- Consumes: `.reveal` and `.visible` CSS classes from Task 1
- Produces: `useScrollReveal()` hook returning a React ref; `<FilmstripBorder />` component

- [ ] **Step 1: Create the useScrollReveal hook**

```typescript
import { useEffect, useRef } from "react";

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      el.classList.add("visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
```

- [ ] **Step 2: Create the FilmstripBorder component**

```tsx
export function FilmstripBorder({ className }: { className?: string }) {
  return <div className={`filmstrip-border w-full ${className ?? ""}`} />;
}
```

- [ ] **Step 3: Verify imports work**

Create a temporary test: import both in `landing.tsx`, render `<FilmstripBorder />` and wrap an element in `<div ref={useScrollReveal()} className="reveal">`. Confirm no build errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/shared/
git commit -m "feat(landing): add scroll reveal hook and FilmstripBorder component"
```

---

## Task 3: Nav Component

**Files:**
- Create: `src/components/landing/Nav.tsx`

**Interfaces:**
- Consumes: Jalebi tokens from Task 1
- Produces: `<Nav />` rendered at top of landing page

- [ ] **Step 1: Create Nav component**

```tsx
import { useState, useEffect } from "react";

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Timeline", href: "#timeline" },
  { label: "Pricing", href: "#pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 h-[72px] flex items-center justify-between px-6 md:px-12 transition-all duration-150 ${
        scrolled
          ? "bg-jalebi-bg/80 backdrop-blur-xl border-b border-jalebi-border"
          : "bg-transparent"
      }`}
    >
      {/* Logo */}
      <a href="/" className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-jalebi-accent tracking-tight font-display">
          Jalebi
        </span>
      </a>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-8">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm text-jalebi-border-strong hover:text-white transition-colors duration-150"
          >
            {link.label}
          </a>
        ))}
      </nav>

      {/* CTAs */}
      <div className="flex items-center gap-3">
        <a
          href="/sign-in"
          className="text-sm px-4 py-2 rounded-full text-jalebi-border-strong hover:text-white transition-colors duration-150"
        >
          Log in
        </a>
        <a
          href="/sign-up"
          className="text-sm px-5 py-2 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold hover:bg-jalebi-accent-hover transition-colors duration-120"
        >
          Get started
        </a>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily import and render `<Nav />` in `landing.tsx`. Confirm it appears fixed at top, links work, scrolled state triggers backdrop blur.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Nav.tsx
git commit -m "feat(landing): add sticky glassmorphism Nav component"
```

---

## Task 4: Hero Section (without preview)

**Files:**
- Create: `src/components/landing/Hero.tsx`
- Create: `src/components/landing/EditorToggle.tsx`

**Interfaces:**
- Consumes: Jalebi tokens, useScrollReveal from Task 2
- Produces: `<Hero />` with headline, subhead, beta badge, EditorToggle, placeholder for preview

- [ ] **Step 1: Create EditorToggle component**

```tsx
import { useState } from "react";

export type EditorMode = "simple" | "advanced";

interface EditorToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

export function EditorToggle({ mode, onChange }: EditorToggleProps) {
  return (
    <div className="inline-flex items-center bg-jalebi-surface rounded-full p-1 border border-jalebi-border">
      <button
        onClick={() => onChange("simple")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 ${
          mode === "simple" ? "text-jalebi-bg" : "text-jalebi-border-strong hover:text-white"
        }`}
      >
        Simple
      </button>
      <button
        onClick={() => onChange("advanced")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 ${
          mode === "advanced" ? "text-jalebi-bg" : "text-jalebi-border-strong hover:text-white"
        }`}
      >
        Advanced
      </button>
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-jalebi-accent rounded-full transition-all duration-200 ease-out"
        style={{
          left: mode === "simple" ? "4px" : "calc(50% + 0px)",
        }}
      />
    </div>
  );
}
```

Note: the parent of the toggle buttons needs `position: relative` for the sliding indicator. The outer `<div>` has `relative` via Tailwind.

- [ ] **Step 2: Create Hero component**

```tsx
import { useState } from "react";
import { useScrollReveal } from "./shared/useScrollReveal";
import { EditorToggle, type EditorMode } from "./EditorToggle";

export function Hero() {
  const [mode, setMode] = useState<EditorMode>("simple");
  const ref = useScrollReveal();

  return (
    <section
      ref={ref}
      className="reveal flex flex-col items-center text-center pt-32 pb-16 px-6 max-w-[900px] mx-auto"
    >
      {/* Beta badge */}
      <div className="inline-flex items-center gap-2 bg-jalebi-surface border border-jalebi-border rounded-full px-4 py-1.5 mb-8">
        <span className="text-xs font-medium text-jalebi-border-strong">
          Now in beta — join early
        </span>
      </div>

      {/* Headline */}
      <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white font-display mb-6">
        Your clips,
        <br />
        edited by AI <span className="text-jalebi-accent">in minutes</span>.
      </h1>

      {/* Subhead */}
      <p className="text-lg text-jalebi-border-strong max-w-[640px] leading-relaxed mb-10">
        Upload raw footage. Describe what you want. Jalebi assembles a
        professional cut — scene detection, pacing, effects — in under a minute.
      </p>

      {/* Mode toggle */}
      <div className="relative mb-12">
        <EditorToggle mode={mode} onChange={setMode} />
      </div>

      {/* Preview placeholder — filled in Task 5 */}
      <div className="w-full max-w-[800px] aspect-video bg-jalebi-surface rounded-2xl border border-jalebi-border mb-10" />

      {/* CTAs */}
      <div className="flex items-center gap-4">
        <a
          href="/sign-up"
          className="px-8 py-3 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold text-sm hover:bg-jalebi-accent-hover transition-colors duration-120"
        >
          Start editing free
        </a>
        <a
          href="#demo"
          className="px-8 py-3 rounded-full border border-jalebi-border text-white font-medium text-sm hover:border-jalebi-border-strong transition-colors duration-120"
        >
          Watch demo
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify render**

Import `<Hero />` in `landing.tsx`. Confirm: badge, headline with orange accent, subhead, toggle renders, placeholder box visible, CTAs styled correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Hero.tsx src/components/landing/EditorToggle.tsx
git commit -m "feat(landing): add Hero section with EditorToggle"
```

---

## Task 5: ScrubbablePreview Component

**Files:**
- Create: `src/components/landing/ScrubbablePreview.tsx`
- Modify: `src/components/landing/Hero.tsx` — wire in the preview, lift `mode` state

**Interfaces:**
- Consumes: `EditorMode` type from EditorToggle, FilmstripBorder from Task 2
- Produces: `<ScrubbablePreview mode={mode} />` replacing the placeholder div in Hero

- [ ] **Step 1: Create ScrubbablePreview component**

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { FilmstripBorder } from "./shared/FilmstripBorder";
import type { EditorMode } from "./EditorToggle";

const SIMPLE_FRAMES = Array.from({ length: 12 }, (_, i) => `/frames/simple-${i}.webp`);
const ADVANCED_FRAMES = Array.from({ length: 12 }, (_, i) => `/frames/advanced-${i}.webp`);

interface ScrubbablePreviewProps {
  mode: EditorMode;
}

export function ScrubbablePreview({ mode }: ScrubbablePreviewProps) {
  const frames = mode === "simple" ? SIMPLE_FRAMES : ADVANCED_FRAMES;
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoplayRef = useRef<number | null>(null);

  // Autoplay: drift frameIndex 0→11 over 4s, loop, until user interacts
  useEffect(() => {
    if (hasInteracted) return;

    let start: number | null = null;
    const duration = 4000;

    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = (elapsed % duration) / duration;
      setFrameIndex(Math.floor(progress * frames.length));
      autoplayRef.current = requestAnimationFrame(tick);
    };

    autoplayRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoplayRef.current) cancelAnimationFrame(autoplayRef.current);
    };
  }, [hasInteracted, frames.length]);

  // Reset on mode change
  useEffect(() => {
    setFrameIndex(0);
    setHasInteracted(false);
  }, [mode]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHasInteracted(true);
    const val = parseInt(e.target.value, 10);
    setFrameIndex(Math.min(val, frames.length - 1));
  }, [frames.length]);

  return (
    <div className="w-full max-w-[800px] mx-auto">
      {/* Frame display */}
      <div
        className={`relative w-full aspect-video bg-jalebi-surface rounded-2xl overflow-hidden border transition-colors duration-150 ${
          mode === "simple" ? "border-jalebi-accent/20" : "border-jalebi-border"
        }`}
      >
        {/* Placeholder frame — in production, use <img> with preloaded frames */}
        <div className="absolute inset-0 flex items-center justify-center text-jalebi-border-strong text-sm">
          Frame {frameIndex + 1} / {frames.length} — {mode} mode
        </div>
      </div>

      {/* Filmstrip scrub track */}
      <FilmstripBorder className="mt-2" />

      {/* Range input (invisible but functional for a11y) */}
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={frames.length - 1}
        value={frameIndex}
        onChange={handleInput}
        className="w-full h-8 mt-1 cursor-grab active:cursor-grabbing opacity-0"
        aria-label={`Scrub through ${mode} editor preview frames`}
      />

      {/* Visual playhead (synced to range input) */}
      <div
        className="relative h-0 -mt-8 pointer-events-none"
        style={{ left: `${(frameIndex / (frames.length - 1)) * 100}%` }}
      >
        <div className="absolute -translate-x-1/2 w-0.5 h-4 bg-jalebi-accent rounded-full" />
        <div className="absolute -translate-x-1/2 -top-1 w-3 h-3 bg-jalebi-accent rounded-full border-2 border-jalebi-bg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into Hero**

In `Hero.tsx`, replace the placeholder `<div className="w-full max-w-[800px] aspect-video bg-jalebi-surface rounded-2xl border border-jalebi-border mb-10" />` with:

```tsx
<ScrubbablePreview mode={mode} />
```

Add the import: `import { ScrubbablePreview } from "./ScrubbablePreview";`

- [ ] **Step 3: Create placeholder frame images**

Create the directory `public/frames/` and add a note that production frames should be WebP/AVIF stills. For now the preview shows frame numbers.

- [ ] **Step 4: Verify interaction**

- Confirm autoplay drifts the playhead on load
- Dragging the range input stops autoplay and shows correct frame index
- Switching mode resets to frame 0
- Range input is keyboard-operable (arrow keys)

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/ScrubbablePreview.tsx src/components/landing/Hero.tsx
git commit -m "feat(landing): add ScrubbablePreview with autoplay scrub and frame array"
```

---

## Task 6: TryItNow Section

**Files:**
- Create: `src/components/landing/TryItNow.tsx`

**Interfaces:**
- Consumes: useScrollReveal from Task 2, Jalebi tokens from Task 1
- Produces: `<TryItNow />` section with upload/paste input and sample clips

- [ ] **Step 1: Create TryItNow component**

```tsx
import { useState, useCallback } from "react";
import { useScrollReveal } from "./shared/useScrollReveal";

const SAMPLE_CLIPS = [
  { label: "Beach sunset", duration: "0:45" },
  { label: "City timelapse", duration: "1:12" },
  { label: "Mountain drone", duration: "0:33" },
];

export function TryItNow() {
  const ref = useScrollReveal();
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // TODO: handle file drop
  }, []);

  return (
    <section ref={ref} className="reveal bg-jalebi-surface py-32 px-6">
      <div className="max-w-[720px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-4">
          Try it now
        </h2>
        <p className="text-jalebi-border-strong mb-10">
          Drop a clip or paste a link to see Jalebi in action.
        </p>

        {/* Input bar */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-3 bg-jalebi-bg rounded-full border-2 px-5 py-3 transition-all duration-100 ${
            isDragOver
              ? "border-jalebi-accent shadow-[0_0_0_4px_var(--color-jalebi-accent-muted)]"
              : "border-jalebi-border"
          }`}
        >
          {/* Upload icon */}
          <svg className="w-5 h-5 text-jalebi-border-strong shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Or paste a link..."
            className="flex-1 bg-transparent text-white text-sm placeholder:text-jalebi-border-strong outline-none"
          />

          <button
            className="w-8 h-8 rounded-full bg-jalebi-accent flex items-center justify-center shrink-0 hover:bg-jalebi-accent-hover transition-colors duration-120"
            aria-label="Submit"
          >
            <svg className="w-4 h-4 text-jalebi-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Sample clips */}
        <p className="text-xs text-jalebi-border-strong mt-6 mb-4">
          Or try one of our sample clips
        </p>
        <div className="flex items-center justify-center gap-3">
          {SAMPLE_CLIPS.map((clip) => (
            <button
              key={clip.label}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-jalebi-surface-2 border border-jalebi-border text-sm text-jalebi-border-strong hover:text-white hover:border-jalebi-border-strong transition-all duration-150"
            >
              <span>{clip.label}</span>
              <span className="text-xs text-jalebi-border-strong">{clip.duration}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify render**

Confirm: dark band separates from hero, input has drag-over glow effect, sample clip chips are clickable, submit button is orange.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/TryItNow.tsx
git commit -m "feat(landing): add TryItNow section with upload/paste input"
```

---

## Task 7: SocialProofMarquee

**Files:**
- Create: `src/components/landing/SocialProofMarquee.tsx`

**Interfaces:**
- Consumes: FilmstripBorder from Task 2
- Produces: `<SocialProofMarquee />` auto-scrolling horizontal row

- [ ] **Step 1: Add marquee CSS to styles.css**

Add to `@layer utilities`:

```css
  .marquee-track {
    display: flex;
    width: max-content;
    animation: marquee-scroll 40s linear infinite;
  }

  .marquee-track:hover {
    animation-play-state: paused;
  }

  @keyframes marquee-scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
```

- [ ] **Step 2: Create SocialProofMarquee component**

```tsx
import { FilmstripBorder } from "./shared/FilmstripBorder";

const CLIPS = [
  { user: "@sarah.creates", label: "Travel vlog" },
  { user: "@devfilms", label: "Short film" },
  { user: "@alexwang", label: "Product demo" },
  { user: "@mariaedits", label: "Wedding highlight" },
  { user: "@jakeprod", label: "Music video" },
  { user: "@linvisuals", label: "Documentary" },
];

// Duplicate for seamless loop
const DUPLICATED = [...CLIPS, ...CLIPS];

export function SocialProofMarquee() {
  return (
    <section className="py-24 overflow-hidden">
      <div className="marquee-track">
        {DUPLICATED.map((clip, i) => (
          <div
            key={`${clip.user}-${i}`}
            className="flex-shrink-0 w-[280px] mx-3"
          >
            <div className="bg-jalebi-surface rounded-xl border border-jalebi-border p-4">
              <div className="aspect-video bg-jalebi-surface-2 rounded-lg mb-3 flex items-center justify-center text-jalebi-border-strong text-xs">
                {clip.label}
              </div>
              <FilmstripBorder />
              <p className="text-xs text-jalebi-border-strong mt-2">{clip.user}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify marquee scrolls**

Confirm: auto-scrolls continuously, pauses on hover, no jitter at loop point (seamless due to duplicate array).

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/SocialProofMarquee.tsx src/styles.css
git commit -m "feat(landing): add SocialProofMarquee with CSS-only auto-scroll"
```

---

## Task 8: FeatureSplit Section

**Files:**
- Create: `src/components/landing/FeatureSplit.tsx`

**Interfaces:**
- Consumes: useScrollReveal, FilmstripBorder, Jalebi tokens
- Produces: `<FeatureSplit />` two-column Simple vs Advanced comparison

- [ ] **Step 1: Create FeatureSplit component**

```tsx
import { useScrollReveal } from "./shared/useScrollReveal";
import { FilmstripBorder } from "./shared/FilmstripBorder";

export function FeatureSplit() {
  const ref = useScrollReveal();

  return (
    <section id="features" ref={ref} className="reveal py-32 px-6">
      <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Simple editor */}
        <div className="bg-jalebi-surface rounded-2xl border border-jalebi-border p-12 relative overflow-hidden">
          {/* Decorative squiggle */}
          <svg
            className="absolute top-8 right-8 w-12 h-12 text-jalebi-accent opacity-30"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M8 40 C16 8, 32 40, 40 8" strokeLinecap="round" />
          </svg>

          <h3 className="text-2xl font-bold text-white font-display mb-3">
            Simple editor
          </h3>
          <p className="text-jalebi-border-strong mb-8 leading-relaxed">
            Drag. Drop. Done. — AI handles the rest.
          </p>

          <div className="aspect-video bg-jalebi-surface-2 rounded-xl border border-jalebi-border flex items-center justify-center mb-6">
            <span className="text-sm text-jalebi-border-strong">Simple UI preview</span>
          </div>
          <FilmstripBorder />

          <ul className="mt-6 space-y-2 text-sm text-jalebi-border-strong">
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> One-click edits
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Auto pacing
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> No timeline needed
            </li>
          </ul>
        </div>

        {/* Advanced editor */}
        <div className="bg-jalebi-surface rounded-2xl border border-jalebi-border p-12 relative overflow-hidden"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        >
          <h3 className="text-2xl font-bold text-white font-display mb-3">
            Advanced editor
          </h3>
          <p className="text-jalebi-border-strong mb-8 leading-relaxed">
            Multi-track timeline. Keyframe control. Full color pipeline.
          </p>

          <div className="aspect-video bg-jalebi-surface-2 rounded-xl flex items-center justify-center mb-6 border border-jalebi-border">
            <span className="text-sm text-jalebi-border-strong">Timeline UI preview</span>
          </div>
          <FilmstripBorder />

          <ul className="mt-6 space-y-2 text-sm text-jalebi-border-strong">
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Multi-track timeline
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Keyframe animation
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Color grading pipeline
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify render**

Confirm: two columns on desktop, stacked on mobile, left has squiggle decoration, right has grid texture, both have filmstrip borders, scroll reveal works.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/FeatureSplit.tsx
git commit -m "feat(landing): add FeatureSplit Simple vs Advanced comparison"
```

---

## Task 9: Pricing Section

**Files:**
- Create: `src/components/landing/Pricing.tsx`

**Interfaces:**
- Consumes: useScrollReveal, Jalebi tokens
- Produces: `<Pricing />` three-tier pricing cards

- [ ] **Step 1: Create Pricing component**

```tsx
import { useScrollReveal } from "./shared/useScrollReveal";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["5 exports/mo", "720p render", "Basic AI cuts", "Community support"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Flux",
    price: "$19",
    period: "/mo",
    features: ["Unlimited exports", "4K render", "Advanced AI effects", "Priority support", "Custom branding"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Nova",
    price: "$49",
    period: "/mo",
    features: ["Everything in Flux", "Team collaboration", "API access", "Dedicated support", "SLA guarantee", "Earn up to 30% on referrals"],
    cta: "Contact sales",
    featured: false,
  },
];

export function Pricing() {
  const ref = useScrollReveal();

  return (
    <section id="pricing" ref={ref} className="reveal py-32 px-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-4">
            Simple pricing
          </h2>
          <p className="text-jalebi-border-strong">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 flex flex-col ${
                tier.featured
                  ? "bg-jalebi-surface border-2 border-jalebi-accent relative"
                  : "bg-jalebi-surface border border-jalebi-border"
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-jalebi-accent text-jalebi-bg text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}

              <h3 className="text-lg font-semibold text-white mb-2">{tier.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-white">{tier.price}</span>
                <span className="text-sm text-jalebi-border-strong">{tier.period}</span>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-jalebi-border-strong">
                    <span className="text-jalebi-accent mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={tier.featured ? "/sign-up" : "/sign-up"}
                className={`w-full py-3 rounded-full text-sm font-semibold text-center transition-colors duration-120 ${
                  tier.featured
                    ? "bg-jalebi-accent text-jalebi-bg hover:bg-jalebi-accent-hover"
                    : "border border-jalebi-border text-white hover:border-jalebi-border-strong"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify render**

Confirm: three cards, middle has accent border + "Most popular" badge, Nova CTA is solid accent, feature lists with checkmarks, responsive stacking.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Pricing.tsx
git commit -m "feat(landing): add Pricing section with three-tier cards"
```

---

## Task 10: FinalCTA + Footer

**Files:**
- Create: `src/components/landing/FinalCTA.tsx`
- Create: `src/components/landing/Footer.tsx`

**Interfaces:**
- Consumes: useScrollReveal, FilmstripBorder, Jalebi tokens
- Produces: `<FinalCTA />` closing section, `<Footer />` standard footer

- [ ] **Step 1: Create FinalCTA component**

```tsx
import { useScrollReveal } from "./shared/useScrollReveal";
import { FilmstripBorder } from "./shared/FilmstripBorder";

export function FinalCTA() {
  const ref = useScrollReveal();

  return (
    <section ref={ref} className="reveal py-32 px-6">
      <FilmstripBorder className="max-w-[1100px] mx-auto mb-16" />
      <div className="max-w-[600px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-8">
          Stop editing.<br />Start directing.
        </h2>
        <a
          href="/sign-up"
          className="inline-block px-10 py-4 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold text-base hover:bg-jalebi-accent-hover transition-colors duration-120"
        >
          Get started free
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create Footer component**

```tsx
const LINKS = {
  Product: ["Features", "Pricing", "Changelog", "Docs"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy", "Terms", "Security"],
};

export function Footer() {
  return (
    <footer className="border-t border-jalebi-border py-16 px-6">
      <div className="max-w-[1100px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div>
          <span className="text-lg font-semibold text-jalebi-accent tracking-tight font-display">
            Jalebi
          </span>
          <p className="text-xs text-jalebi-border-strong mt-2">
            AI-powered video editing.
          </p>
        </div>

        {/* Link groups */}
        {Object.entries(LINKS).map(([group, links]) => (
          <div key={group}>
            <h4 className="text-xs font-semibold text-jalebi-border-strong uppercase tracking-wider mb-3">
              {group}
            </h4>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-jalebi-border-strong hover:text-white transition-colors duration-150"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="max-w-[1100px] mx-auto mt-16 pt-8 border-t border-jalebi-border flex items-center justify-between">
        <p className="text-xs text-jalebi-border-strong">
          © 2026 Jalebi. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          {/* Social icons placeholder */}
          {["X", "GH", "DC"].map((icon) => (
            <a
              key={icon}
              href="#"
              className="w-8 h-8 rounded-full bg-jalebi-surface border border-jalebi-border flex items-center justify-center text-xs text-jalebi-border-strong hover:text-white hover:border-jalebi-border-strong transition-all duration-150"
            >
              {icon}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/FinalCTA.tsx src/components/landing/Footer.tsx
git commit -m "feat(landing): add FinalCTA and Footer components"
```

---

## Task 11: Assemble Landing Page

**Files:**
- Modify: `src/routes/landing.tsx` — replace entire contents with new landing page composition

**Interfaces:**
- Consumes: all components from Tasks 3–10
- Produces: complete landing page at `/`

- [ ] **Step 1: Read the current landing.tsx**

Read the file to understand the current structure. Then replace entirely.

- [ ] **Step 2: Write new landing.tsx**

```tsx
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TryItNow } from "@/components/landing/TryItNow";
import { SocialProofMarquee } from "@/components/landing/SocialProofMarquee";
import { FeatureSplit } from "@/components/landing/FeatureSplit";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-jalebi-bg text-white">
      <Nav />
      <main>
        <Hero />
        <TryItNow />
        <SocialProofMarquee />
        <FeatureSplit />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 3: Verify full page renders**

Run `pnpm dev` and visit `/`. Confirm:
- Nav is sticky with backdrop blur on scroll
- Hero shows headline, toggle, preview, CTAs
- TryItNow has input with drag-over glow
- Marquee auto-scrolls
- FeatureSplit shows two columns
- Pricing shows three cards
- FinalCTA has filmstrip border bookend
- Footer renders correctly
- Scroll reveal animations fire on each section

- [ ] **Step 4: Verify accessibility**

- Tab through all interactive elements — focus rings visible
- Scrub range input responds to arrow keys
- Reduced-motion preference disables animations

- [ ] **Step 5: Commit**

```bash
git add src/routes/landing.tsx
git commit -m "feat(landing): assemble complete Jalebi landing page"
```

---

## Task 12: Polish + Cross-Cut

**Files:**
- Modify: `src/styles.css` — add `prefers-reduced-motion` handling for new animations
- Modify: any component as needed based on visual review

**Interfaces:**
- Consumes: all tasks above
- Produces: final polished state

- [ ] **Step 1: Add reduced-motion rules**

Ensure the existing `@media (prefers-reduced-motion: reduce)` block in `src/styles.css` also covers:
- `.reveal` elements: remove transition, set `opacity: 1; transform: none`
- `.marquee-track`: remove animation
- Autoplay in ScrubbablePreview: skip (already handled via `window.matchMedia` check)

- [ ] **Step 2: Verify contrast**

Check `--text-secondary` (#9a9a9f) on `--bg-base` (#0a0a0b) passes WCAG AA (4.5:1). If borderline, bump to #a8a8ad.

- [ ] **Step 3: Final visual pass**

Review each section for spacing consistency (8px scale), radius consistency, color token usage. Fix any hand-placed values that should use tokens.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(landing): polish accessibility, contrast, and spacing consistency"
```
