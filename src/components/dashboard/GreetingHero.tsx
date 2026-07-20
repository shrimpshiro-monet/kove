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
