import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/landing")({
  component: LandingPage,
});

const FEEL_WORDS = [
  "cinematic",
  "ethereal",
  "gritty",
  "dreamlike",
  "electric",
  "raw",
  "hypnotic",
  "pulse-pounding",
  "noir",
  "euphoric",
  "haunting",
  "kinetic",
  "luminous",
  "menacing",
  "tender",
  "volatile",
  "surreal",
  "visceral",
  "melancholic",
  "frenzied",
];

const CHAT_PROMPTS = [
  "Make it cinematic — slow zooms, warm tones, beat drops on the chorus",
  "Cut to the beat, add glitch transitions, desaturate the bridge",
  "Match the energy of @craigsharma's latest reel, boost contrast",
  "Intro is too long — trim to 3 seconds, punch in on the vocals",
];

function useRotatingWord() {
  const [display, setDisplay] = useState("");
  const idx = useRef(0);
  const char = useRef(0);
  const phase = useRef<"type" | "pause" | "delete">("type");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = FEEL_WORDS[idx.current];

      if (phase.current === "type") {
        char.current++;
        setDisplay(word.slice(0, char.current));
        if (char.current >= word.length) {
          phase.current = "pause";
          timer = setTimeout(tick, 2000);
          return;
        }
        timer = setTimeout(tick, 60 + Math.random() * 40);
      } else if (phase.current === "pause") {
        phase.current = "delete";
        timer = setTimeout(tick, 30);
      } else {
        char.current--;
        setDisplay(word.slice(0, char.current));
        if (char.current <= 0) {
          phase.current = "type";
          idx.current = (idx.current + 1) % FEEL_WORDS.length;
          timer = setTimeout(tick, 400);
          return;
        }
        timer = setTimeout(tick, 25);
      }
    };

    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);

  return display;
}

function useTypingPlaceholder() {
  const [text, setText] = useState("");
  const idx = useRef(0);
  const char = useRef(0);
  const deleting = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const current = CHAT_PROMPTS[idx.current];

    const tick = () => {
      if (!deleting.current) {
        setText(current.slice(0, char.current + 1));
        char.current++;
        if (char.current === current.length) {
          timer = setTimeout(() => {
            deleting.current = true;
            tick();
          }, 2400);
          return;
        }
        timer = setTimeout(tick, 35 + Math.random() * 30);
      } else {
        setText(current.slice(0, char.current - 1));
        char.current--;
        if (char.current === 0) {
          deleting.current = false;
          idx.current = (idx.current + 1) % CHAT_PROMPTS.length;
          timer = setTimeout(tick, 500);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []);

  return text;
}

export function LandingPage() {
  const heroWord = useRotatingWord();
  const typedPlaceholder = useTypingPlaceholder();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Listen for OpenReel ready signal
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "openreel:ready") {
        setEditorReady(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSubmit = useCallback(() => {
    const email = query.trim();
    if (!email) return;
    window.location.href = "/sign-up";
  }, [query]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden font-sans">
      {/* ── HEADER ── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="text-[16px] font-semibold tracking-tight text-white">
          kove<span className="text-primary">.</span>
        </div>

        <nav className="hidden md:flex gap-9 list-none">
          {["features", "timeline", "pricing", "docs"].map((item) => (
            <li key={item}>
              <a
                href={`#${item}`}
                className="text-sm font-medium tracking-wide text-white/50 transition-colors hover:text-white capitalize"
              >
                {item}
              </a>
            </li>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button
            onClick={() => { window.location.href = "/sign-in"; }}
            className="text-sm font-medium text-white/50 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
          >
            Sign In
          </button>
          <button
            onClick={() => { window.location.href = "/sign-up"; }}
            className="bg-white text-[#0a0a0a] border-none px-6 py-2.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors duration-300 hover:bg-[#e8e8e8]"
          >
            Get Early Access
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-[140px] pb-16 text-center">
        {/* Grid bg */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/[0.07] rounded-full blur-[120px] pointer-events-none" />

        {/* Badge */}
        <div className="relative inline-flex items-center gap-2 bg-primary/[0.08] border border-primary/[0.15] rounded-full px-5 py-2 text-xs font-medium text-primary tracking-[0.05em] uppercase mb-10">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          Now in Public Beta
        </div>

        {/* Title */}
        <h1 className="relative text-[clamp(32px,5vw,56px)] font-semibold tracking-[-0.02em] leading-[1.1] max-w-[900px] mb-7">
          kreate something{" "}
          <span className="text-primary inline-block min-w-[160px]">
            {heroWord}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="relative text-lg text-white/40 max-w-[520px] leading-relaxed mb-14">
          Drop your raw footage. Tell the AI what you want. Get a beat-synced,
          color-graded, effects-laden edit — automatically.
        </p>

        {/* Prompt bar */}
        <div className="relative w-full max-w-[720px] mb-12">
          {/* Playhead */}
          {!focused && (
            <div
              className="absolute -top-3 -bottom-3 w-0.5 bg-primary/40 z-10 animate-[playhead_3s_ease-in-out_infinite]"
              style={{
                boxShadow: "0 0 10px rgba(29,59,106,0.15)",
              }}
            >
              <div className="absolute -top-1 -left-[9px] w-3 h-3 bg-primary/50 rounded-full" />
            </div>
          )}

          <div
            className={`relative h-16 rounded-full flex items-center px-7 overflow-hidden transition-all duration-300 ${
              focused
                ? "bg-background shadow-[0_0_0_2px_var(--primary),0_0_30px_rgba(255,78,0,0.2)]"
                : "bg-[#111111] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.4)]"
            }`}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

            <svg
              className="w-5 h-5 mr-4 opacity-30 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={typedPlaceholder}
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder:text-white/25 font-sans"
            />

            <button
              onClick={handleSubmit}
              className="w-9 h-9 rounded-full bg-primary border-none cursor-pointer flex items-center justify-center ml-4 shrink-0 transition-colors hover:bg-primary-hover"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Feature pills */}
        <div className="relative flex flex-wrap justify-center gap-6 md:gap-12 mt-2">
          {["Beat-sync cuts", "Auto color grade", "Smart transitions", "4K export"].map(
            (feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-xs text-white/25 font-normal">
                <span className="w-1.5 h-1.5 rounded-sm bg-primary/40" />
                {feat}
              </div>
            )
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="relative py-20 px-6">
        <div className="max-w-[900px] mx-auto flex items-center justify-between gap-4">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-4 flex-1">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center text-sm font-semibold text-white/40">
                  {i + 1}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/60 mb-1">{step.title}</div>
                  <div className="text-[11px] text-white/20 max-w-[160px]">{step.desc}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent mt-[-32px]" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── WAVE TRANSITION ── */}
      <section className="relative h-[700px] overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 700"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="wg1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0C1E3A" />
              <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#102A4F" />
            </linearGradient>
            <linearGradient id="wg2" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#102A4F" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0C1E3A" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="wg3" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--background)" />
            </linearGradient>
            <filter id="wglow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path fill="url(#wg1)" opacity="0.9">
            <animate
              attributeName="d"
              dur="8s"
              repeatCount="indefinite"
              values="M0,280 C240,180 480,380 720,280 C960,180 1200,380 1440,280 L1440,700 L0,700 Z;M0,320 C240,220 480,340 720,300 C960,200 1200,340 1440,300 L1440,700 L0,700 Z;M0,280 C240,180 480,380 720,280 C960,180 1200,380 1440,280 L1440,700 L0,700 Z"
            />
          </path>

          <path fill="url(#wg2)" opacity="0.7">
            <animate
              attributeName="d"
              dur="6s"
              repeatCount="indefinite"
              values="M0,340 C320,240 640,440 960,340 C1120,290 1280,390 1440,340 L1440,700 L0,700 Z;M0,360 C320,260 640,400 960,360 C1120,310 1280,370 1440,360 L1440,700 L0,700 Z;M0,340 C320,240 640,440 960,340 C1120,290 1280,390 1440,340 L1440,700 L0,700 Z"
            />
          </path>

          <path fill="url(#wg3)">
            <animate
              attributeName="d"
              dur="7s"
              repeatCount="indefinite"
              values="M0,400 C360,300 720,500 1080,400 C1200,360 1320,440 1440,400 L1440,700 L0,700 Z;M0,420 C360,320 720,460 1080,420 C1200,380 1320,420 1440,420 L1440,700 L0,700 Z;M0,400 C360,300 720,500 1080,400 C1200,360 1320,440 1440,400 L1440,700 L0,700 Z"
            />
          </path>

          <path
            fill="none"
            stroke="url(#wg1)"
            strokeWidth="2"
            filter="url(#wglow)"
            opacity="0.6"
          >
            <animate
              attributeName="d"
              dur="4s"
              repeatCount="indefinite"
              values="M0,320 C180,260 360,380 540,320 C720,260 900,380 1080,320 C1200,280 1320,360 1440,320;M0,340 C180,280 360,360 540,340 C720,280 900,360 1080,340 C1200,300 1320,340 1440,340;M0,320 C180,260 360,380 540,320 C720,260 900,380 1080,320 C1200,280 1320,360 1440,320"
            />
          </path>

          <g opacity="0.06" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5">
            <path d="M200,300 C220,260 260,250 270,280 C280,310 250,330 230,320 C210,310 200,280 220,270" />
            <path d="M600,250 C620,210 660,200 670,230 C680,260 650,280 630,270 C610,260 600,230 620,220" />
            <path d="M1000,310 C1020,270 1060,260 1070,290 C1080,320 1050,340 1030,330 C1010,320 1000,290 1020,280" />
            <circle cx="300" cy="310" r="15" />
            <circle cx="315" cy="310" r="15" />
            <circle cx="700" cy="270" r="15" />
            <circle cx="715" cy="270" r="15" />
            <circle cx="1100" cy="330" r="15" />
            <circle cx="1115" cy="330" r="15" />
          </g>

          <g fill="rgba(29,59,106,0.3)">
            {[150, 400, 650, 900, 1150, 1350].map((cx, i) => (
              <circle key={i} cx={cx} r={i % 2 === 0 ? 2 : 1.5}>
                <animate
                  attributeName="cy"
                  dur={`${3 + i * 0.5}s`}
                  values={`${300 + i * 10};${280 + i * 10};${300 + i * 10}`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>
        </svg>
      </section>

      {/* ── BOTTOM SECTION ── */}
      <section className="relative bg-[#0a0a0a] min-h-screen px-6 md:px-12" id="features">
        {/* Brushed metal texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.006) 2px, rgba(255,255,255,0.006) 4px)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.02]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
            backgroundSize: "256px 256px",
          }}
        />

        {/* Feature grid */}
        <div className="relative z-10 py-32 max-w-[1200px] mx-auto">
          <div className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] uppercase text-primary/70 mb-5">
            <span className="w-6 h-px bg-primary/40" />
            Core Engine
          </div>
          <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-white leading-[1.2] max-w-[600px] mb-4">
            Every frame,
            <br />
            computed once.
          </h2>
          <p className="text-base text-white/35 max-w-[480px] leading-relaxed mb-[72px]">
            The MonetEDL pipeline analyzes footage, maps energy curves, and
            generates cuts — before you hit render.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.04]">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group bg-[#0e0e0e] p-12 transition-all duration-400 hover:bg-[#111111] hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-xl bg-primary/[0.12] border border-primary/[0.2] flex items-center justify-center mb-7">
                  <f.icon />
                </div>
                <h3 className="text-base font-semibold text-white mb-3 tracking-tight">
                  {f.title}
                </h3>
                <p className="text-sm text-white/30 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Live NLE preview */}
        <div className="relative z-10 pb-[120px] max-w-[1200px] mx-auto" id="timeline">
          <div className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] uppercase text-primary/70 mb-5">
            <span className="w-6 h-px bg-primary/40" />
            Live Editor
          </div>
          <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-white leading-[1.2] max-w-[600px] mb-4">
            Not a mockup.
            <br />
            The real NLE.
          </h2>
          <p className="text-base text-white/35 max-w-[480px] leading-relaxed mb-12">
            This is the actual kove non-linear editor. Timeline, tracks,
            effects — all functional.
          </p>

          <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.6)]">
            {/* macOS title bar */}
            <div className="flex items-center justify-between px-5 py-3 bg-[#1a1a1a] border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
              </div>
              <span className="text-[11px] font-medium text-white/25 font-mono">
                kove nle
              </span>
              <div className="w-[52px]" />
            </div>

            {/* Iframe */}
            <div className="relative" style={{ height: "clamp(400px, 50vw, 640px)" }}>
              <iframe
                ref={iframeRef}
                src={import.meta.env.VITE_OPENREEL_EDITOR_URL || "http://localhost:5173"}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; webgpu"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 py-20 max-w-[1200px] mx-auto border-t border-white/[0.06]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {STATS.map((s, i) => (
              <div key={i}>
                <div className="text-3xl font-semibold tracking-[-0.02em] leading-none mb-2 text-white">
                  {s.num}
                </div>
                <div className="text-[12px] text-white/25 font-normal tracking-wide">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="relative z-10 py-[100px] max-w-[1200px] mx-auto border-t border-white/[0.06]" id="pricing">
          <div className="bg-gradient-to-br from-background-secondary to-background rounded-2xl p-16 text-center relative overflow-hidden border border-primary/[0.15]">
            <h2 className="text-[clamp(24px,2.5vw,36px)] font-semibold text-white tracking-[-0.02em] mb-4 relative">
              Stop editing. Start directing.
            </h2>
            <p className="text-sm text-white/35 max-w-[400px] mx-auto mb-10 leading-relaxed relative">
              kove is in public beta. Early users get lifetime access at founding
              rates.
            </p>
            <button
              onClick={() => { window.location.href = "/sign-up"; }}
              className="relative inline-flex items-center gap-2.5 bg-white text-[#0a0a0a] border-none px-9 py-4 rounded-full text-[14px] font-medium cursor-pointer transition-colors hover:bg-[#e8e8e8]"
            >
              Join the Beta
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 py-12 border-t border-white/[0.06] max-w-[1200px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-base font-semibold text-white tracking-tight">
              kove<span className="text-primary">.</span>
            </div>
            <ul className="flex gap-8 list-none">
              {["GitHub", "Discord", "Twitter", "Blog"].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-[12px] font-normal text-white/20 no-underline transition-colors hover:text-white/60"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
            <span className="text-xs text-white/15 font-medium">
              © 2026 kove. Built with MonetEDL.
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
}

/* ── Data ── */

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const WaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const LayersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

const FEATURES = [
  {
    icon: PlayIcon,
    title: "Scene Detection",
    desc: "FFmpeg-powered real cut detection. No mock timestamps — actual scene boundaries extracted from pixel changes.",
  },
  {
    icon: WaveIcon,
    title: "Energy Mapping",
    desc: "Per-frame energy curves (motion + brightness) sync your cuts to the beat, not just timestamps.",
  },
  {
    icon: GridIcon,
    title: "Effect Registry",
    desc: "120+ effects cataloged by function — blur, glow, shake, zoom, color shifts. Each mapped to FFmpeg filter chains.",
  },
  {
    icon: ClockIcon,
    title: "60-Second Edits",
    desc: "Upload → AI analysis → EDL generation → Canvas2D preview in under 30 seconds. Export MP4 in under 60.",
  },
  {
    icon: LayersIcon,
    title: "Reference DNA",
    desc: "Drop a reference video. kove extracts its editing DNA — cut rate, color, energy — and applies it to your footage.",
  },
  {
    icon: BoxIcon,
    title: "Cloud Render",
    desc: "BullMQ queue + Redis. Editly + FFmpeg render workers process jobs asynchronously. 4K output, zero local load.",
  },
];

const STATS = [
  { num: "60s", label: "Upload to export" },
  { num: "120+", label: "Effects cataloged" },
  { num: "91%", label: "Reference similarity" },
  { num: "4K", label: "Max output resolution" },
];

const STEPS = [
  { title: "Upload", desc: "Drop your raw footage and a song" },
  { title: "Describe", desc: "Tell the AI the vibe you want" },
  { title: "Export", desc: "Get a beat-synced 4K edit" },
];

