# Kove Dashboard Redesign — Design Spec

## Context

The current dashboard (`src/routes/dashboard.tsx`) is a 1025-line monolith with 6 sub-pages, inline SVGs, and a cramped icon-only sidebar. It works but feels flat and generic. This redesign replaces it with a ChatGPT-inspired landing experience: centered greeting, action input, quick-action pills, and a collapsible sidebar — all wrapped in a dual-theme system rooted in the founder's heritage.

**Dual identity**: Islamabad (Margalla green) × Multan (Multani blue), blended with NYC industrial darkness. Two themes that shift based on editor context.

---

## 1. Dual Theme System

### Theme Tokens

Both themes share the same token structure. Only values change.

| Token | **Margalla** (Simple Editor) | **Multan** (Advanced Editor) |
|---|---|---|
| `--background` | `#0c0a09` (warm charcoal) | `#0a0b0e` (subway tunnel) |
| `--surface` | `#181614` (brownstone) | `#15171c` (concrete) |
| `--accent` | `#4A7A6A` (Margalla green) | `#4A8B8F` (Multani blue) |
| `--accent-hover` | `#5A8A7A` | `#5A9B9F` |
| `--text-primary` | `#E0DCD4` (aged paper) | `#E2DDD4` (sandstone) |
| `--text-secondary` | `#9A9590` | `#9A9A9F` |
| `--text-muted` | `#5A5854` | `#5A5A60` |
| `--border` | `rgba(255,255,255,0.06)` | same |
| `--border-hover` | `rgba(255,255,255,0.10)` | same |

### Theme Switching

- **Auto**: Simple editor → Margalla, Advanced editor → Multan
- **Manual override**: Settings page has a theme picker (radio: Margalla / Multan / Auto)
- **Implementation**: CSS class on `<html>` (`theme-margalla` / `theme-multan`), toggled by a React context (`ThemeProvider`)
- **Transition**: `transition: background-color 0.3s, color 0.3s` on `body` for smooth shifts
- **Persistence**: localStorage key `kove-theme`

### CSS Variable Integration

Add to `src/styles.css`:
```css
:root.theme-margalla {
  --background: #0c0a09;
  --surface: #181614;
  --accent: #4A7A6A;
  /* ... */
}

:root.theme-multan {
  --background: #0a0b0e;
  --surface: #15171c;
  --accent: #4A8B8F;
  /* ... */
}
```

These register in `@theme inline {}` so Tailwind can use `bg-accent`, `text-accent`, etc.

---

## 2. Component Architecture

### File Structure

```
src/
  components/dashboard/
    ThemeProvider.tsx       — dual-theme React context
    DashboardLayout.tsx     — shell: sidebar + main + ambient effects
    Sidebar.tsx             — collapsible nav (icon-only ↔ labeled)
    GreetingHero.tsx        — headline + subtext
    ActionInput.tsx         — central prompt input box
    QuickActions.tsx        — pill-shaped action buttons
    DashboardPage.tsx       — composes all dashboard components
  routes/
    dashboard.tsx           — thin auth gate, renders DashboardPage
    dashboard.projects.tsx  — projects sub-page (future)
```

### Component Contracts

#### `ThemeProvider`

```tsx
type Theme = "margalla" | "multan" | "auto";
interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  active: "margalla" | "multan"; // resolved theme (never "auto")
}
```

Wraps the dashboard. Reads from localStorage, writes class to `<html>`.

#### `DashboardLayout`

```tsx
interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}
```

Renders: ambient glow orb (top center), grain overlay, sidebar slot, main content area with `<TopBar>`.

#### `Sidebar`

```tsx
interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  items: NavItem[];
}
```

- Collapsed: 68px, icon-only, logo at top
- Expanded: 240px, icon + label per item
- Toggle: button at bottom of nav stack
- Smooth CSS transition on width
- Fixed position, left side, full height minus padding
- Active state uses `--accent` color

#### `GreetingHero`

```tsx
interface GreetingHeroProps {
  username?: string; // from Clerk
  isSignedIn: boolean;
}
```

- Logged in: "Welcome back, {username}" or randomized greeting
- Logged out: "What can I help with?"
- Uses `font-display` (Space Grotesk), `clamp(28px, 4vw, 44px)` sizing
- Below headline: short subtext describing Kove's value prop

#### `ActionInput`

```tsx
interface ActionInputProps {
  onSubmit: (query: string) => void;
}
```

- Centered, max-width 640px, height ~56px
- Focus ring uses `--accent` color (not hardcoded orange)
- On submit: calls `onSubmit(query)` — dashboard handles navigation to `/simple-editor?q=...`
- Subtle glow on focus: `box-shadow: 0 0 0 2px var(--accent), 0 0 30px color-mix(in oklch, var(--accent) 15%, transparent)`

#### `QuickActions`

```tsx
interface QuickActionsProps {
  actions: { label: string; query: string }[];
  onAction: (query: string) => void;
}
```

- Horizontal row, flex-wrap, centered
- Each pill: `rounded-full`, `bg-white/[0.03]`, `border border-white/[0.06]`
- Hover: fill to `bg-white/[0.06]`, text brightens
- Click: calls `onAction(pill.query)`

---

## 3. Dashboard Layout

### Visual Hierarchy (top to bottom)

```
┌─────────────────────────────────────────────────┐
│ [Sidebar]        [TopBar: search + auth]        │
│   🏠                                         🔍 │
│   📁                                    [Avatar] │
│   ...                                            │
│                                                  │
│              ┌─────────────────────┐             │
│              │   Greeting Hero     │             │
│              │  "What are we       │             │
│              │   making today?"    │             │
│              └─────────────────────┘             │
│              ┌─────────────────────┐             │
│              │   Action Input      │             │
│              │  [Describe vibe...] │             │
│              └─────────────────────┘             │
│              ┌───┐ ┌───┐ ┌───┐ ┌───┐            │
│              │pill│ │pill│ │pill│ │pill│           │
│              └───┘ └───┘ └───┘ └───┘            │
│                                                  │
│              ┌─────────────────────┐             │
│              │  Recent Projects    │             │
│              │  (3 items max)      │             │
│              └─────────────────────┘             │
│                                                  │
│              [Bottom promo strip]                │
└─────────────────────────────────────────────────┘
```

### Auth-Aware States

| State | Greeting | Input | Top-Right | Easter Egg |
|---|---|---|---|---|
| **Loading** | Skeleton shimmer | Skeleton | Skeleton avatar | No |
| **Logged out** | "What can I help with?" | Visible, generic placeholder | "Log in" pill | No |
| **Logged in** | "Welcome back, {name}" | Visible, personalized placeholder | Avatar + dropdown | Yes |

### Loading Guard

The auth state check (`useAuth()` from Clerk) returns `undefined` initially. During this window:
- Show skeleton placeholders for greeting + input + avatar
- Do NOT flash the logged-out state then swap (causes layout shift)
- Use `isSignedIn === undefined` as the loading signal

---

## 4. Easter Egg: Console Greeting

### When It Fires
- Only when `isSignedIn === true`
- On `DashboardPage` mount (useEffect)
- Once per session (track with `sessionStorage`)

### The Log
```js
const greetings = [
  `welcome back, ${username}\nstill in beta — thanks for testing early. break something for us.`,
  `${username} again? nice. the build is ${COMMIT_HASH.slice(0, 7)} if you're curious.`,
  `hey ${username}. you're one of the early ones. we'll remember that.`,
  `${username}! perfect timing — this build is fresh. ${new Date().toLocaleDateString()}.`,
  `look who's back. ${username}. don't check the network tab, it's embarrassing.`,
];
```

Styled with `color: var(--accent)` for the greeting line, muted gray for the subtext.

### Hidden Global
```js
window.__beta = {
  message: "you found it. we're still building. report bugs at github.com/anomalyco/opencode/issues",
  build: COMMIT_HASH,
  version: "0.1.0-beta",
};
```

---

## 5. Quick Actions (Pills)

Default set (can be extended via config later):

```ts
const DEFAULT_ACTIONS = [
  { label: "Cinematic edit", query: "Create a cinematic edit with dramatic cuts and color grading" },
  { label: "Travel montage", query: "Smooth travel montage with transitions and warm tones" },
  { label: "Sports highlight", query: "High-energy sports highlight with beat-synced cuts" },
  { label: "Music video", query: "Moody music video style with effects and pacing" },
];
```

---

## 6. Bottom Promo Strip

A row of 2-3 rounded cards at the bottom of the Overview page. These are placeholder for now — will later show featured templates, recent exports, or promotional content.

- Rounded-2xl cards with gradient thumbnails
- Subtle border, hover elevation
- Fixed height, horizontal scroll on mobile

---

## 7. Projects Sub-Page

The Projects page lives inside the same dashboard shell (sidebar + topbar). It reuses the shared Panel/card components but focuses on a clean project grid.

### Layout
- Header: "Projects" title + "New Project" button (accent-colored)
- Grid of project cards (2-3 columns on desktop, 1 on mobile)
- Each card: thumbnail placeholder (colored gradient), project name, clip count, duration, relative time
- Click card → navigate to `/simple-editor?project={id}`
- Empty state: centered illustration + "Create your first project" CTA

### Components
- `ProjectCard` — rounded-2xl, surface background, border, hover elevation
- Uses the same design tokens as the rest of the dashboard
- Reuses `EmptyState` from the component library

---

## 8. Reuse Strategy

The dashboard components are designed for reuse:
- `GreetingHero` → empty project states, onboarding screens
- `ActionInput` → studio quick-start, any "prompt first" flow
- `QuickActions` → feature discovery, template selection
- `ThemeProvider` → global, any page can consume theme tokens
- `Sidebar` → editor shell (if needed later)

---

## 9. What's NOT in Scope

- Affiliate / Referrals pages (consolidated into "Kontracts" later)
- Full Settings page redesign (only adding theme picker toggle)
- Mobile responsive sidebar (collapsed only on mobile for now)
- Real data integration (projects still from dashboard-store seed data)
- Bottom promo strip (deferred — not confirmed by user)

---

## 10. Open Questions

None — all decisions locked:
- ✅ Dual themes: Margalla (simple) + Multan (advanced)
- ✅ Auto-switch + manual override
- ✅ Component-driven architecture
- ✅ Input redirects to /simple-editor
- ✅ Scope: Overview + Projects + Sidebar shell
- ✅ Easter egg: randomized console log
- ✅ `COMMIT_HASH`: read from `import.meta.env.VITE_COMMIT_HASH` (set in wrangler/vite config), fallback to `"dev"`
