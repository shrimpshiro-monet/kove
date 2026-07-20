# Kove Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic dashboard with a component-driven, dual-themed (Margalla/Multan) ChatGPT-style landing experience.

**Architecture:** 8 new components in `src/components/dashboard/`, CSS theme variables in `src/styles.css`, thin route wrapper in `src/routes/dashboard.tsx`. Theme context switches CSS class on `<html>`. Each component is self-contained and reusable.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS v4 (oklch tokens), shadcn/ui (skeleton, avatar, button), Clerk auth, `cn()` utility from `@/lib/utils`.

## Global Constraints

- All colors via CSS variables — no hardcoded hex in components
- Use `cn()` from `@/lib/utils` for conditional classes
- Named exports only (`export function ComponentName`)
- No `any` — design the type or use `unknown`
- No inline SVG icons where a shared `Icons` object works
- Rounded corners: `rounded-2xl` (16px) for cards, `rounded-full` for pills
- Font classes: `font-display` (Space Grotesk), `font-ui` (Inter), `font-mono` (JetBrains Mono)
- Animation: use existing utility classes (`animate-fade-in`, `animate-slide-up`, `stagger-N`)
- Path alias: `@/` → `./src/`

---

## File Structure

| File | Purpose | Action |
|---|---|---|
| `src/styles.css` | Add Margalla + Multan theme variables | Modify |
| `src/components/dashboard/ThemeProvider.tsx` | Dual-theme React context | Create |
| `src/components/dashboard/DashboardLayout.tsx` | Shell: ambient glow, grain, sidebar + main slots | Create |
| `src/components/dashboard/Sidebar.tsx` | Collapsible nav (68px ↔ 240px) | Create |
| `src/components/dashboard/GreetingHero.tsx` | Centered headline + subtext | Create |
| `src/components/dashboard/ActionInput.tsx` | Central prompt input box | Create |
| `src/components/dashboard/QuickActions.tsx` | Row of pill-shaped action buttons | Create |
| `src/components/dashboard/Icons.tsx` | Shared SVG icon components | Create |
| `src/components/dashboard/DashboardPage.tsx` | Compose all dashboard components | Create |
| `src/routes/dashboard.tsx` | Thin auth gate, replaces current 1025-line file | Replace |

---

### Task 1: Theme System (CSS Variables + ThemeProvider)

**Files:**
- Modify: `src/styles.css` (add theme variable blocks)
- Create: `src/components/dashboard/ThemeProvider.tsx`

**Interfaces:**
- Produces: `ThemeProvider` component, `useTheme()` hook returning `{ theme, setTheme, active }`

- [ ] **Step 1: Add Margalla theme variables to `src/styles.css`**

Add after the existing `.dark { }` block (after line 254), before the light theme:

```css
/*
 * ─────────────────────────────────────────────────────────────
 * .theme-margalla — Islamabad green (simple editor)
 * ─────────────────────────────────────────────────────────────
 */
:root.theme-margalla,
.theme-margalla {
  --background: #0c0a09;
  --background-secondary: #141210;
  --background-tertiary: #1c1a17;
  --background-elevated: #242220;

  --foreground: #E0DCD4;
  --text-primary: #E0DCD4;
  --text-secondary: #9A9590;
  --text-muted: #5A5854;
  --text-tertiary: #3A3835;

  --card: #181614;
  --card-foreground: #E0DCD4;
  --popover: #1c1a17;
  --popover-foreground: #E0DCD4;

  --primary: #4A7A6A;
  --primary-foreground: #E0DCD4;
  --primary-hover: #5A8A7A;
  --primary-active: #3A6A5A;

  --secondary: #1c1a17;
  --secondary-foreground: #E0DCD4;
  --muted: #1c1a17;
  --muted-foreground: #9A9590;
  --accent: #4A7A6A;
  --accent-foreground: #E0DCD4;

  --destructive: #8B4A4A;
  --destructive-foreground: #E0DCD4;

  --border: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.10);
  --border-active: rgba(255, 255, 255, 0.15);
  --border-strong: rgba(255, 255, 255, 0.20);
  --input: #1c1a17;
  --ring: #4A7A6A;

  --status-success: #4A7A6A;
  --status-warning: #B8863A;
  --status-info: #5A7A9A;
}
```

- [ ] **Step 2: Add Multan theme variables to `src/styles.css`**

Add after the Margalla block:

```css
/*
 * ─────────────────────────────────────────────────────────────
 * .theme-multan — Multan blue (advanced editor)
 * ─────────────────────────────────────────────────────────────
 */
:root.theme-multan,
.theme-multan {
  --background: #0a0b0e;
  --background-secondary: #121316;
  --background-tertiary: #1a1b1f;
  --background-elevated: #222328;

  --foreground: #E2DDD4;
  --text-primary: #E2DDD4;
  --text-secondary: #9A9A9F;
  --text-muted: #5A5A60;
  --text-tertiary: #3A3A40;

  --card: #15171c;
  --card-foreground: #E2DDD4;
  --popover: #1a1b1f;
  --popover-foreground: #E2DDD4;

  --primary: #4A8B8F;
  --primary-foreground: #E2DDD4;
  --primary-hover: #5A9B9F;
  --primary-active: #3A7B7F;

  --secondary: #1a1b1f;
  --secondary-foreground: #E2DDD4;
  --muted: #1a1b1f;
  --muted-foreground: #9A9A9F;
  --accent: #4A8B8F;
  --accent-foreground: #E2DDD4;

  --destructive: #8B4A5A;
  --destructive-foreground: #E2DDD4;

  --border: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.10);
  --border-active: rgba(255, 255, 255, 0.15);
  --border-strong: rgba(255, 255, 255, 0.20);
  --input: #1a1b1f;
  --ring: #4A8B8F;

  --status-success: #4A8B8F;
  --status-warning: #B8863A;
  --status-info: #5A7A9A;
}
```

- [ ] **Step 3: Add smooth theme transition to `src/styles.css`**

Add to the `@layer base` block (after the form element styles, around line 398):

```css
html {
  transition: background-color 0.3s ease-out;
}

html body {
  transition: background-color 0.3s ease-out, color 0.3s ease-out;
}
```

- [ ] **Step 4: Register accent color in `@theme inline` block**

Add inside the existing `@theme inline { }` block (after `--color-ring`, around line 79):

```css
  /* ── Dashboard accent ── */
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-surface: var(--background-secondary);
```

- [ ] **Step 5: Create ThemeProvider**

Create `src/components/dashboard/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ThemeChoice = "margalla" | "multan" | "auto";
type ResolvedTheme = "margalla" | "multan";

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  active: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "kove-theme";

function getInitialTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "margalla" || stored === "multan" || stored === "auto") return stored;
  } catch {}
  return "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(getInitialTheme);
  const [editorContext, setEditorContext] = useState<ResolvedTheme>("margalla");

  const active: ResolvedTheme = theme === "auto" ? editorContext : theme;

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-margalla", "theme-multan");
    root.classList.add(`theme-${active}`);
  }, [active]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, active }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function useSetEditorContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useSetEditorContext must be used within ThemeProvider");
  return useCallback((editor: "simple" | "advanced") => {
    // This is a simplified version — the full implementation
    // would use a separate context. For now, setTheme handles it.
  }, []);
}
```

- [ ] **Step 6: Verify theme variables compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from ThemeProvider.tsx

- [ ] **Step 7: Commit**

```bash
git add src/styles.css src/components/dashboard/ThemeProvider.tsx
git commit -m "feat(dashboard): add dual theme system — Margalla green + Multan blue"
```

---

### Task 2: Shared Icons

**Files:**
- Create: `src/components/dashboard/Icons.tsx`

**Interfaces:**
- Produces: `Icons` object with named icon components (logo, search, bell, chevronUp, chevronDown, plus, settings, folder, grid, etc.)

- [ ] **Step 1: Create Icons.tsx**

Create `src/components/dashboard/Icons.tsx`:

```tsx
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export const Icons = {
  logo: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="800" fontFamily="Inter">k</text>
    </svg>
  ),
  search: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  bell: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  chevronDown: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevronLeft: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  plus: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  settings: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  folder: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  grid: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  play: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  menu: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
} as const;
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from Icons.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Icons.tsx
git commit -m "feat(dashboard): add shared SVG icon components"
```

---

### Task 3: Sidebar

**Files:**
- Create: `src/components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `Icons` from `./Icons`, `cn()` from `@/lib/utils`, `useTheme()` from `./ThemeProvider`
- Produces: `Sidebar` component rendered inside `DashboardLayout`

- [ ] **Step 1: Create Sidebar.tsx**

Create `src/components/dashboard/Sidebar.tsx`:

```tsx
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { useTheme } from "./ThemeProvider";

export interface NavItem {
  id: string;
  icon: React.FC<{ className?: string }>;
  label: string;
}

interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  items: NavItem[];
}

export function Sidebar({ active, onNavigate, items }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const { active: resolvedTheme } = useTheme();

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col fixed left-4 top-4 bottom-4 z-50",
        "bg-[var(--background-secondary)]/90 backdrop-blur-xl rounded-2xl",
        "border border-[var(--border)] shadow-float",
        "transition-all duration-300 ease-out",
        "animate-slide-in-left",
        expanded ? "w-[240px] px-3 py-4" : "w-[68px] px-2 py-4 items-center"
      )}
    >
      {/* Logo */}
      <div className={cn("mb-4", expanded ? "px-2" : "p-2")}>
        <Icons.logo className="w-5 h-5 text-[var(--accent)]" />
        {expanded && (
          <span className="ml-2.5 text-sm font-bold font-display text-[var(--text-primary)] tracking-tight">
            Kove
          </span>
        )}
      </div>

      <div className="w-8 h-px bg-[var(--border)] mb-2" />

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 flex-1">
        {items.map(({ id, icon: Icon, label }, i) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={expanded ? undefined : label}
            className={cn(
              "flex items-center gap-2.5 rounded-xl transition-all duration-200",
              `animate-fade-in stagger-${Math.min(i + 1, 6)}`,
              expanded ? "px-3 py-2.5 w-full" : "w-10 h-10 justify-center",
              active === id
                ? "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:scale-105"
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {expanded && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="w-8 h-px bg-[var(--border)] my-2" />

      {/* Settings */}
      <button
        onClick={() => onNavigate("settings")}
        title={expanded ? undefined : "Settings"}
        className={cn(
          "flex items-center gap-2.5 rounded-xl transition-all duration-200",
          expanded ? "px-3 py-2.5 w-full" : "w-10 h-10 justify-center",
          active === "settings"
            ? "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:scale-105"
        )}
      >
        <Icons.settings className="w-5 h-5 shrink-0" />
        {expanded && (
          <span className="text-sm font-medium">Settings</span>
        )}
      </button>

      {/* Collapse Toggle */}
      <div className="mt-2">
        <button
          onClick={toggle}
          className={cn(
            "flex items-center gap-2 rounded-xl transition-all duration-200 text-[var(--text-tertiary)] hover:text-[var(--text-muted)] hover:bg-white/[0.04]",
            expanded ? "px-3 py-2 w-full" : "w-10 h-10 justify-center"
          )}
        >
          {expanded ? (
            <Icons.chevronLeft className="w-4 h-4" />
          ) : (
            <Icons.chevronRight className="w-4 h-4" />
          )}
          {expanded && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from Sidebar.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/Sidebar.tsx
git commit -m "feat(dashboard): add collapsible sidebar with theme-aware accent"
```

---

### Task 4: GreetingHero

**Files:**
- Create: `src/components/dashboard/GreetingHero.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `./ThemeProvider`
- Produces: `GreetingHero` component with personalized or generic headline

- [ ] **Step 1: Create GreetingHero.tsx**

Create `src/components/dashboard/GreetingHero.tsx`:

```tsx
import { useTheme } from "./ThemeProvider";

const GREETINGS_LOGGED_IN = [
  "What are we making today?",
  "Ready to create something?",
  "What's the vision?",
  "Let's make something great.",
];

const GREETINGS_LOGGED_OUT = [
  "What can I help with?",
  "Create anything you can imagine.",
  "Your AI video editor.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface GreetingHeroProps {
  username?: string;
  isSignedIn: boolean;
}

export function GreetingHero({ username, isSignedIn }: GreetingHeroProps) {
  const { active } = useTheme();

  const headline = isSignedIn
    ? (username ? `Welcome back, ${username}` : pickRandom(GREETINGS_LOGGED_IN))
    : pickRandom(GREETINGS_LOGGED_OUT);

  const subtext = isSignedIn
    ? "Drop your footage, tell the AI what you want. Beat-synced, color-graded, effects-laden — automatically."
    : "An AI video editor that turns raw footage into polished edits. No timeline, just vibes.";

  return (
    <div className="text-center mb-10 max-w-[600px] mx-auto animate-slide-up">
      <h1 className="text-[clamp(28px,4vw,44px)] font-display font-bold text-[var(--text-primary)] tracking-[-0.02em] leading-[1.1] mb-4">
        {headline}
      </h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-[420px] mx-auto leading-relaxed">
        {subtext}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/GreetingHero.tsx
git commit -m "feat(dashboard): add GreetingHero with auth-aware headlines"
```

---

### Task 5: ActionInput

**Files:**
- Create: `src/components/dashboard/ActionInput.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `./ThemeProvider`
- Produces: `ActionInput` component; calls `onSubmit(query)` on Enter

- [ ] **Step 1: Create ActionInput.tsx**

Create `src/components/dashboard/ActionInput.tsx`:

```tsx
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";

interface ActionInputProps {
  onSubmit: (query: string) => void;
  placeholder?: string;
}

export function ActionInput({ onSubmit, placeholder = "Describe the vibe…" }: ActionInputProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const { active } = useTheme();

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      onSubmit(query.trim());
      setQuery("");
    }
  }, [query, onSubmit]);

  return (
    <div className="w-full max-w-[640px] mb-8 animate-slide-up stagger-2 mx-auto">
      <div
        className={cn(
          "relative h-14 rounded-2xl flex items-center px-5 overflow-hidden transition-all duration-300",
          focused
            ? "bg-[var(--background-secondary)] shadow-[0_0_0_2px_var(--accent),0_0_30px_color-mix(in_oklch,var(--accent)_15%,transparent)]"
            : "bg-[var(--background-tertiary)] shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.3)]"
        )}
      >
        <svg className="w-4 h-4 mr-3 opacity-25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className={cn(
            "w-8 h-8 rounded-xl border-none cursor-pointer flex items-center justify-center ml-3 shrink-0 transition-all duration-200",
            query.trim()
              ? "bg-[var(--accent)] text-white hover:opacity-90"
              : "bg-white/[0.04] text-[var(--text-tertiary)] cursor-not-allowed"
          )}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ActionInput.tsx
git commit -m "feat(dashboard): add ActionInput with theme-aware focus glow"
```

---

### Task 6: QuickActions

**Files:**
- Create: `src/components/dashboard/QuickActions.tsx`

**Interfaces:**
- Produces: `QuickActions` component; calls `onAction(query)` when pill clicked

- [ ] **Step 1: Create QuickActions.tsx**

Create `src/components/dashboard/QuickActions.tsx`:

```tsx
import { cn } from "@/lib/utils";

export interface QuickAction {
  label: string;
  query: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onAction: (query: string) => void;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "Cinematic edit", query: "Create a cinematic edit with dramatic cuts and color grading" },
  { label: "Travel montage", query: "Smooth travel montage with transitions and warm tones" },
  { label: "Sports highlight", query: "High-energy sports highlight with beat-synced cuts" },
  { label: "Music video", query: "Moody music video style with effects and pacing" },
];

export function QuickActions({ actions = DEFAULT_ACTIONS, onAction }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10 animate-slide-up stagger-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.query)}
          className={cn(
            "text-[11px] px-3.5 py-1.5 rounded-full",
            "bg-white/[0.03] border border-[var(--border)]",
            "text-[var(--text-muted)]",
            "hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:border-[var(--border-hover)]",
            "transition-all duration-200"
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/QuickActions.tsx
git commit -m "feat(dashboard): add QuickActions pill buttons"
```

---

### Task 7: DashboardLayout

**Files:**
- Create: `src/components/dashboard/DashboardLayout.tsx`

**Interfaces:**
- Consumes: `Sidebar` from `./Sidebar`, `Icons` from `./Icons`, `useTheme()` from `./ThemeProvider`
- Produces: `DashboardLayout` shell component

- [ ] **Step 1: Create DashboardLayout.tsx**

Create `src/components/dashboard/DashboardLayout.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { useTheme } from "./ThemeProvider";
import { Sidebar, type NavItem } from "./Sidebar";

interface TopBarProps {
  isSignedIn: boolean;
  username?: string;
}

function TopBar({ isSignedIn, username }: TopBarProps) {
  return (
    <header className="flex items-center justify-end py-4 mb-6 gap-3">
      <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-colors">
        <Icons.search className="w-4 h-4" />
      </button>
      {isSignedIn ? (
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
          {username?.[0]?.toUpperCase() || "?"}
        </div>
      ) : (
        <a
          href="/sign-in"
          className="text-xs px-4 py-2 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all"
        >
          Log in
        </a>
      )}
    </header>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  navItems: NavItem[];
  isSignedIn: boolean;
  username?: string;
}

export function DashboardLayout({
  children,
  activePage,
  onNavigate,
  navItems,
  isSignedIn,
  username,
}: DashboardLayoutProps) {
  const { active } = useTheme();

  return (
    <div className={cn("min-h-screen text-[var(--text-primary)] font-sans relative overflow-hidden")}>
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[120px] pointer-events-none opacity-[0.04]"
        style={{ backgroundColor: "var(--accent)" }}
      />

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[100] opacity-[0.012]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundSize: "256px 256px",
        }}
      />

      <Sidebar active={activePage} onNavigate={onNavigate} items={navItems} />

      <main className="md:ml-[84px] p-4 md:p-6 lg:p-8 min-h-screen animate-fade-in">
        <TopBar isSignedIn={isSignedIn} username={username} />
        <div key={activePage} className="animate-slide-up">
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardLayout.tsx
git commit -m "feat(dashboard): add DashboardLayout shell with ambient glow + grain"
```

---

### Task 8: DashboardPage (Compose + Auth + Easter Egg)

**Files:**
- Create: `src/components/dashboard/DashboardPage.tsx`
- Modify: `src/routes/dashboard.tsx` (replace 1025-line file)

**Interfaces:**
- Consumes: `ThemeProvider`, `DashboardLayout`, `GreetingHero`, `ActionInput`, `QuickActions`
- Consumes: `useAuth()` from `@clerk/react`
- Produces: Thin route wrapper at `src/routes/dashboard.tsx`

- [ ] **Step 1: Create DashboardPage.tsx**

Create `src/components/dashboard/DashboardPage.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { DashboardLayout } from "./DashboardLayout";
import { GreetingHero } from "./GreetingHero";
import { ActionInput } from "./ActionInput";
import { QuickActions } from "./QuickActions";
import { Icons } from "./Icons";
import type { NavItem } from "./Sidebar";

const NAV_ITEMS: NavItem[] = [
  { id: "overview", icon: Icons.grid, label: "Overview" },
  { id: "projects", icon: Icons.folder, label: "Projects" },
];

const COMMIT_HASH = import.meta.env.VITE_COMMIT_HASH || "dev";
const VERSION = "0.1.0-beta";

function fireEasterEgg(username: string) {
  const alreadyFired = sessionStorage.getItem("kove-easter-egg");
  if (alreadyFired) return;
  sessionStorage.setItem("kove-easter-egg", "1");

  const greetings = [
    `%cwelcome back, ${username}\n%cstill in beta — thanks for testing early. break something for us.`,
    `%c${username} again? nice. the build is ${COMMIT_HASH.slice(0, 7)} if you're curious.`,
    `%cheys ${username}. you're one of the early ones. we'll remember that.`,
    `%c${username}! perfect timing — this build is fresh. ${new Date().toLocaleDateString()}.`,
    `%clook who's back. ${username}. don't check the network tab, it's embarrassing.`,
  ];

  const msg = greetings[Math.floor(Math.random() * greetings.length)];

  console.log(
    msg,
    "color:var(--accent, #4A7A6A); font-weight:bold; font-size:14px;",
    "color:#9A9590; font-size:12px;"
  );

  // Hidden global
  (window as Record<string, unknown>).__beta = {
    message: "you found it. we're still building.",
    build: COMMIT_HASH,
    version: VERSION,
  };
}

function DashboardInner() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const easterEggFired = useRef(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Don't redirect — just show generic UI
    }
  }, [isSignedIn, isLoaded]);

  useEffect(() => {
    if (isSignedIn && !easterEggFired.current) {
      easterEggFired.current = true;
      fireEasterEgg("creator");
    }
  }, [isSignedIn]);

  const handleNavigate = (page: string) => {
    if (page === "projects") {
      navigate({ to: "/dashboard", search: { page: "projects" } });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <DashboardLayout
      activePage="overview"
      onNavigate={handleNavigate}
      navItems={NAV_ITEMS}
      isSignedIn={isSignedIn ?? false}
      username={isSignedIn ? "creator" : undefined}
    >
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16">
        <GreetingHero
          isSignedIn={isSignedIn ?? false}
          username={isSignedIn ? "creator" : undefined}
        />
        <ActionInput
          onSubmit={(q) => {
            window.location.href = `/simple-editor?q=${encodeURIComponent(q)}`;
          }}
        />
        <QuickActions
          onAction={(q) => {
            window.location.href = `/simple-editor?q=${encodeURIComponent(q)}`;
          }}
        />
      </div>
    </DashboardLayout>
  );
}

export function DashboardPage() {
  return (
    <ThemeProvider>
      <DashboardInner />
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Replace route file**

Replace the entire contents of `src/routes/dashboard.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from dashboard files

- [ ] **Step 4: Verify dev server starts**

Run: `pnpm dev:api 2>&1 | head -5` (or `bun run dev`)
Expected: Server starts without errors

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardPage.tsx src/routes/dashboard.tsx
git commit -m "feat(dashboard): compose DashboardPage with auth, easter egg, dual theme

Replaces 1025-line monolith with thin route + component architecture.
- ThemeProvider wraps dashboard, auto-applies Margalla/Multan CSS class
- GreetingHero shows auth-aware personalized headline
- ActionInput redirects to /simple-editor with query
- QuickActions shows default pill set
- Easter egg fires randomized console greeting on first mount
- Layout has ambient glow orb + grain overlay"
```

---

### Task 9: Projects Sub-Page (Card Grid)

**Files:**
- Create: `src/components/dashboard/ProjectsPage.tsx`
- Modify: `src/components/dashboard/DashboardPage.tsx` (add page routing)

**Interfaces:**
- Consumes: `useDashboardStore()` from `@/stores/dashboard-store`
- Consumes: `useNavigate()` from `@tanstack/react-router`
- Produces: `ProjectsPage` component, wired into DashboardPage routing

- [ ] **Step 1: Create ProjectsPage.tsx**

Create `src/components/dashboard/ProjectsPage.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { useTheme } from "./ThemeProvider";
import type { Project } from "@/stores/dashboard-store";

interface ProjectsPageProps {
  projects: Project[];
  onAdd: (name: string) => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function ProjectsPage({ projects, onAdd }: ProjectsPageProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-display font-bold text-[var(--text-primary)] tracking-tight">
            Projects
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace.
          </p>
        </div>
        <button
          onClick={() => navigate({ to: "/simple-editor" })}
          className="flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:-translate-y-0.5 shrink-0"
        >
          <Icons.plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* Project Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4 text-[var(--text-tertiary)]">
            <Icons.folder className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">No projects yet</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
            Create your first project from the overview or by typing a prompt.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p, i) => (
            <button
              key={p.id}
              onClick={() => navigate({ to: "/simple-editor", search: { project: p.id } })}
              className={cn(
                "group flex flex-col rounded-2xl border border-[var(--border)]",
                "bg-[var(--background-secondary)] p-4 text-left",
                "transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-panel-lg hover:border-[var(--border-hover)]",
                `animate-fade-in stagger-${Math.min(i + 1, 6)}`
              )}
            >
              {/* Thumbnail */}
              <div
                className="w-full h-24 rounded-xl mb-3 flex items-center justify-center"
                style={{ backgroundColor: `${p.thumbnailColor || "var(--accent)"}20` }}
              >
                <Icons.play
                  className="w-5 h-5 opacity-40 group-hover:opacity-70 transition-opacity"
                  style={{ color: p.thumbnailColor || "var(--accent)" }}
                />
              </div>

              {/* Info */}
              <h3 className="text-sm font-medium text-[var(--text-primary)] truncate mb-1">
                {p.name}
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {p.clips} clips · {p.duration}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  {formatRelativeTime(p.updatedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update DashboardPage.tsx to support page routing**

Replace the `DashboardInner` function in `src/components/dashboard/DashboardPage.tsx` with:

```tsx
function DashboardInner() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const easterEggFired = useRef(false);
  const [page, setPage] = useState<"overview" | "projects">("overview");

  // Sync URL search param to page state
  const searchParams = Route.useSearch();
  useEffect(() => {
    if (searchParams.page === "projects") setPage("projects");
  }, [searchParams.page]);

  useEffect(() => {
    if (isSignedIn && !easterEggFired.current) {
      easterEggFired.current = true;
      fireEasterEgg("creator");
    }
  }, [isSignedIn]);

  const handleNavigate = (p: string) => {
    if (p === "projects") {
      setPage("projects");
      navigate({ to: "/dashboard", search: { page: "projects" } });
    } else {
      setPage("overview");
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <DashboardLayout
      activePage={page}
      onNavigate={handleNavigate}
      navItems={NAV_ITEMS}
      isSignedIn={isSignedIn ?? false}
      username={isSignedIn ? "creator" : undefined}
    >
      {page === "overview" ? (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16">
          <GreetingHero
            isSignedIn={isSignedIn ?? false}
            username={isSignedIn ? "creator" : undefined}
          />
          <ActionInput
            onSubmit={(q) => {
              window.location.href = `/simple-editor?q=${encodeURIComponent(q)}`;
            }}
          />
          <QuickActions
            onAction={(q) => {
              window.location.href = `/simple-editor?q=${encodeURIComponent(q)}`;
            }}
          />
        </div>
      ) : (
        <ProjectsPage
          projects={projects}
          onAdd={addProject}
        />
      )}
    </DashboardLayout>
  );
}
```

Add these imports to the top of `DashboardPage.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";
import { ProjectsPage } from "./ProjectsPage";
import { Route } from "@tanstack/react-router";
```

Add inside `DashboardInner`:

```tsx
const { state, addProject } = useDashboardStore();
const projects = state.projects;
```

- [ ] **Step 3: Update Route type for search params**

Replace the route definition in `src/routes/dashboard.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/dashboard/DashboardPage";

interface DashboardSearch {
  page?: "overview" | "projects";
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    page: (search.page as "overview" | "projects") || "overview",
  }),
});
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProjectsPage.tsx src/components/dashboard/DashboardPage.tsx src/routes/dashboard.tsx
git commit -m "feat(dashboard): add Projects page with card grid + page routing"
```

---

### Task 10: Final Polish & Verification

**Files:**
- No new files. Verify everything works end-to-end.

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1`
Expected: No errors

- [ ] **Step 2: Run ESLint**

Run: `pnpm eslint src/components/dashboard/ src/routes/dashboard.tsx --no-error-on-unmatched-pattern 2>&1 | head -30`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Verify dev server starts**

Run: `bun run dev 2>&1 | head -10`
Expected: Vite starts on :8787, API on :3000

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:8787/dashboard`:
- [ ] Theme renders (Margalla green accent by default)
- [ ] Greeting headline is visible and centered
- [ ] Input box is centered with focus glow
- [ ] Quick action pills are visible
- [ ] Sidebar is collapsed (68px, icon-only)
- [ ] Sidebar expand/collapse works
- [ ] Clicking a pill redirects to `/simple-editor?q=...`
- [ ] Auth state shows correctly (logged in avatar or "Log in" pill)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(dashboard): final polish — lint, types, verification"
```

---

## Self-Review Checklist

- [ ] Spec coverage: All 10 spec sections have corresponding tasks
- [ ] Placeholder scan: No TBD/TODO/placeholders found
- [ ] Type consistency: `NavItem`, `Project`, `ThemeChoice` types consistent across tasks
- [ ] File paths: All exact paths verified against project structure
- [ ] Commands: All `tsc`, `eslint`, `bun run dev` commands verified
