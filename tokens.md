# Kove Design Tokens

## Palette

| Token | Hex | Role | Usage |
|-------|-----|------|-------|
| `ink` | `#0A0A0A` | Concrete Black | App background, deepest surface |
| `asphalt` | `#141414` | Wet Asphalt | Panel backgrounds, secondary surfaces |
| `studio` | `#1E1E1E` | Studio Grey | Elevated backgrounds, cards |
| `chain` | `#3A3A3A` | Chain Link | Borders, separators, dividers |
| `newsprint` | `#B5B0A6` | Newsprint | Secondary text, labels, timestamps |
| `paper` | `#F5F1E8` | Torn Paper | Primary text, headlines |
| `orange` | `#FF4E00` | Kove Orange | The ONLY accent — CTAs, selected states, focus rings |

### Rules
- Orange is the **only** chromatic color in the editor. Everything else is neutral.
- Never use blue, purple, green, or any other hue as an accent.
- Status colors (success/warning/info) are permitted for feedback only.
- Glow effects use orange, not amber/blue.

## Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sharp` | `4px` | Buttons, inputs, clips, all interactive elements |
| `card` | `6px` | Small cards, chips |
| `panel` | `8px` | Panels, dropdowns |
| `modal` | `10px` | Modals, dialogs |

### Rules
- Kove uses sharp corners. No rounded-full except for circular elements (avatars, dots).
- No `rounded-2xl` or `rounded-3xl` in editor surfaces.

## Typography

| Token | Font Stack | Usage |
|-------|-----------|-------|
| `display` | Space Grotesk, Söhne, Inter, system-ui | Headings, section titles, Kove wordmark |
| `ui` | Inter, Söhne, system-ui | Body text, controls, labels |
| `mono` | JetBrains Mono, Berkeley Mono, ui-monospace | Timecodes, values, filenames, code, terminal |

### Rules
- All numbers (timecodes, durations, percentages) use mono.
- All filenames and paths use mono.
- Chat messages from Kove use mono.
- User messages use grotesk/ui.
- Kove wordmark: all caps mono or display.

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| `fast` | `80ms` | Hover states, focus transitions |
| `base` | `120ms` | Border color changes, input focus |
| `slow` | `200ms` | Panel open/close, modal transitions |
| `ease` | `ease-out` | Default easing for all transitions |

### Rules
- No spring animations. No bounce. No elastic.
- Motion is functional, not decorative.
- Reduced motion: all animations disabled via `prefers-reduced-motion`.

## Focus Ring

- Color: Kove Orange (`#FF4E00`)
- Width: `2px`
- Offset: `2px`
- No glow. No shadow. Just a clean orange outline.

## Shadows

| Class | Effect |
|-------|--------|
| `shadow-glow` | Subtle orange glow (30% opacity) |
| `shadow-glow-lg` | Stronger orange glow (40% opacity) |
| `shadow-panel` | Standard dark panel elevation |
| `shadow-panel-lg` | Larger panel elevation |
| `shadow-float` | Floating element elevation |

### Rules
- Glow shadows use orange, never amber/blue.
- Panel shadows are pure black (oklch 0 0 0), no color tint.

## Status Colors

| Status | Usage |
|--------|-------|
| Success (green) | Completed states, valid input |
| Warning (amber) | Caution states, deprecation |
| Info (blue) | Informational, neutral feedback |
| Destructive (red) | Errors, delete confirmations, danger zones |

Status colors are the **only** exceptions to the "orange only" accent rule.
