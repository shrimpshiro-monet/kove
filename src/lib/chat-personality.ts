// Monet's chat personality — makes the AI feel alive, not robotic

type Context = "first_greeting" | "generating" | "refining" | "error" | "idle" | "suggesting";

const PERSONALITY: Record<Context, string[]> = {
  first_greeting: [
    "Hey — footage is in. What are we making?",
    "Alright, I see the clips. What's the vibe?",
    "Nice — let's turn this into something. What are you thinking?",
    "Got it. Footage loaded. What's the edit about?",
  ],
  generating: [
    "Alright, I'm cutting this together — give me a sec.",
    "Working on it. Finding the best moments...",
    "Cooking. This is going to hit.",
    "On it — picking the strongest clips and lining them up.",
  ],
  refining: [
    "Adjusting — let me see what that looks like.",
    "On it. Tweaking the edit.",
    "Got it, making that change now.",
    "Let me fix that — one sec.",
    "Done — see how that feels.",
    "Tweaked it. How's that look?",
  ],
  error: [
    "Hmm, something broke. Let me try again.",
    "That didn't work — want to try a different approach?",
    "Ran into an issue. Give me a sec to figure it out.",
  ],
  idle: [
    "What's next?",
    "Need anything else?",
    "Want to tweak something?",
    "How's it looking?",
  ],
  suggesting: [
    "I'm noticing a few things I could tighten up. Want me to:",
    "Looking at the edit — I have a few ideas:",
    "I think I can make this stronger. Check these out:",
  ],
};

export function getPersonalityLine(context: Context): string {
  const options = PERSONALITY[context];
  return options[Math.floor(Math.random() * options.length)];
}

// Contextual response builder — makes the bot react to what the user said
export function buildContextualResponse(
  userMessage: string,
  context: {
    shotCount: number;
    totalDuration: number;
    beatScore?: number;
    isRefinement: boolean;
  }
): string {
  const msg = userMessage.toLowerCase();

  // Refinement responses — react to what they asked for
  if (context.isRefinement) {
    if (msg.includes("faster") || msg.includes("tighter") || msg.includes("quicker")) {
      return pick([
        "Tightened it up — cuts should feel snappier now.",
        "Done — faster pacing, more energy.",
        "Made it punchier. See if that hits right.",
      ]);
    }
    if (msg.includes("slower") || msg.includes("breathe") || msg.includes("breathing")) {
      return pick([
        "Slowed it down — gave it more room to breathe.",
        "Done — more breathing room between cuts.",
        "Added some patience to the pacing. Feels more cinematic now.",
      ]);
    }
    if (msg.includes("glow") || msg.includes("flash") || msg.includes("impact")) {
      return pick([
        "Added some glow — should pop on the drops.",
        "Done — glow effects on the high-energy moments.",
        "Cranked up the impact. That should hit harder.",
      ]);
    }
    if (msg.includes("shake")) {
      return pick([
        "Shake added — gives it that raw energy.",
        "Done — shake on the heavy beats.",
        "Added shake. Feels more aggressive now.",
      ]);
    }
    if (msg.includes("smooth") || msg.includes("crossfade") || msg.includes("transition")) {
      return pick([
        "Smoothed out the transitions — should flow better.",
        "Done — crossfades where it made sense.",
        "Added smoother transitions. Less jarring, more cinematic.",
      ]);
    }
    if (msg.includes("beat") || msg.includes("sync")) {
      return pick([
        "Tightened the beat sync — cuts should land cleaner.",
        "Done — realigned to the beat grid.",
        "Beat-locked it harder. Every cut should snap to the rhythm.",
      ]);
    }
    if (msg.includes("effect") || msg.includes("more") || msg.includes("intense")) {
      return pick([
        "Turned up the effects — should feel more intense.",
        "Done — more visual energy throughout.",
        "Added more effects. Don't say I didn't warn you.",
      ]);
    }
    if (msg.includes("clean") || msg.includes("less") || msg.includes("subtle")) {
      return pick([
        "Cleaned it up — less noise, more focus.",
        "Done — stripped it back. Let the footage breathe.",
        "Made it cleaner. Sometimes less is more.",
      ]);
    }
    if (msg.includes("different") || msg.includes("swap") || msg.includes("wrong")) {
      return pick([
        "Swapped it out — try that clip instead.",
        "Done — different segment, should feel better.",
        "Changed it up. See if that works better.",
      ]);
    }
    if (msg.includes("export") || msg.includes("render") || msg.includes("download")) {
      return pick([
        "Rendering it out — this should take a minute.",
        "On it — exporting your edit.",
        "Exporting. I'll let you know when it's ready.",
      ]);
    }
    // Generic refinement acknowledgment
    return pick([
      "Done — see how that feels.",
      "Tweaked it. How's that look?",
      "Updated. Want anything else?",
      "Applied the change. What do you think?",
    ]);
  }

  // First edit generation responses
  if (msg.includes("cinematic") || msg.includes("film") || msg.includes("movie")) {
    return pick([
      "Cinematic — I'll go for that film feel. Tight pacing, warm grades, deliberate cuts.",
      "Got it — going cinematic. Longer shots, moodier color, story-driven cuts.",
    ]);
  }
  if (msg.includes("tiktok") || msg.includes("reel") || msg.includes("viral")) {
    return pick([
      "TikTok mode — fast cuts, high energy, hooks in the first 2 seconds.",
      "Going viral-style — snappy edits, punchy transitions, zero filler.",
    ]);
  }
  if (msg.includes("anime") || msg.includes("amv")) {
    return pick([
      "Anime vibes — high contrast, dramatic cuts, that signature energy.",
      "AMV mode — aggressive pacing, glow effects, beat-synced chaos.",
    ]);
  }
  if (msg.includes("sports") || msg.includes("highlight")) {
    return pick([
      "Sports highlight — tight cuts on the action, energy building to the big plays.",
      "Highlight reel — fastest cuts on the best moments, building to the climax.",
    ]);
  }

  // Default generation response
  return pick([
    `Alright — ${context.shotCount} shots across ${context.totalDuration.toFixed(1)}s. ${context.beatScore ? `Beat sync: ${context.beatScore}%` : "Looking good."} What do you think?`,
    `Done — ${context.shotCount} cuts, ${context.totalDuration.toFixed(1)}s. How's the feel?`,
    `Edit's ready — ${context.shotCount} shots. Take a look and tell me what to change.`,
  ]);
}

// Suggestion builder — proactive improvements
export function buildSuggestions(edl: {
  shots: Array<{ timing: { duration: number }; effects?: unknown[] }>;
  music?: { beatGrid?: number[] };
}): string[] {
  const suggestions: string[] = [];
  const shots = edl.shots;

  if (shots.length === 0) return suggestions;

  // Check for inconsistent pacing
  const durations = shots.map((s) => s.timing.duration);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const longShots = shots.filter((s) => s.timing.duration > avg * 2);
  if (longShots.length > 0) {
    suggestions.push(`${longShots.length} shot${longShots.length > 1 ? "s are" : " is"} much longer than average — want me to tighten them?`);
  }

  // Check for no effects
  const noEffects = shots.filter((s) => !s.effects || s.effects.length === 0);
  if (noEffects.length > shots.length * 0.7) {
    suggestions.push("Most shots have no effects — want me to add some visual energy?");
  }

  // Check for beat sync
  if (edl.music?.beatGrid && edl.music.beatGrid.length > 0) {
    const noBeatLock = shots.filter((s) => !(s as Record<string, unknown>).beatLock);
    if (noBeatLock.length > shots.length * 0.3) {
      suggestions.push(`${noBeatLock.length} shots aren't beat-locked — want me to sync them to the rhythm?`);
    }
  }

  return suggestions.slice(0, 3);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
