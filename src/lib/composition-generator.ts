import type { MonetEDL } from "../server/types/edl";
import { HFComponent, buildComposition } from "./hyperframes/core";
import { kineticText } from "./hyperframes/typography";
import { beatFlashes, scanline, letterboxBars } from "./hyperframes/effects";
import { lightLeak } from "./hyperframes/transitions";

export type CompositionGenre =
  | "anime_amv"
  | "sports_highlight"
  | "cinematic_trailer"
  | "music_video"
  | "wedding"
  | "default";

export interface CompositionInput {
  genre: CompositionGenre;
  title: string;
  subtitle?: string;
  edl: MonetEDL;
}

export function generateComposition(input: CompositionInput): string {
  const { genre, title, subtitle, edl } = input;
  const duration = edl.timeline.duration;
  const beatGrid: number[] = edl.music?.beatGrid ?? [];
  const dropTime = duration * 0.62;

  const safeTitle = sanitize(title);
  const safeSubtitle = sanitize(subtitle ?? "AI‑DIRECTED · MONET");

  const components: HFComponent[] = [];

  // Parse advanced transitions from the EDL
  for (const shot of edl.shots) {
    if (shot.transition?.type === "whip-pan" || shot.transition?.type === "glitch") {
      components.push(lightLeak({ time: shot.timing.startTime, duration: shot.transition.duration }));
    }
  }

  // Genre-specific styling leveraging modular components
  switch (genre) {
    case "anime_amv":
    case "sports_highlight":
    case "music_video":
      components.push(letterboxBars({ dropTime }));
      components.push(beatFlashes({ beatGrid, duration }));
      components.push(scanline({ dropTime }));
      components.push(kineticText({ text: safeTitle, subtitle: safeSubtitle, startTime: 0.5, dropTime }));
      break;
    case "cinematic_trailer":
    case "wedding":
      // More subdued versions
      components.push(letterboxBars({ dropTime }));
      components.push(kineticText({ text: safeTitle, subtitle: safeSubtitle, startTime: 0.5, dropTime }));
      break;
    default:
      components.push(kineticText({ text: safeTitle, subtitle: safeSubtitle, startTime: 0.5, dropTime }));
      components.push(beatFlashes({ beatGrid, duration }));
      break;
  }

  return buildComposition(components, duration);
}

export function extractTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\b(make|create|build|generate|a|an|the|me|my|for|with|and|or|of|to)\b/gi, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ").toUpperCase() || "MY VIDEO";
}

function sanitize(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").slice(0, 80);
}
