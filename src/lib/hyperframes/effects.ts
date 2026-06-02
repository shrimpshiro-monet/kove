import { HFComponent } from "./core";

export function beatFlashes(opts: { beatGrid: number[]; duration: number }): HFComponent {
  const flashes = opts.beatGrid
    .filter((t) => t > 3.5 && t < opts.duration - 1.5)
    .map(
      (t) =>
        `tl.to("#hf-bf", { opacity: 0.55, duration: 0.025 }, ${t.toFixed(3)});
         tl.to("#hf-bf", { opacity: 0, duration: 0.15, ease: "power2.out" }, ${(t + 0.025).toFixed(3)});`
    )
    .join("\n");

  return {
    css: `.hf-beat-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }`,
    html: `<div class="hf-beat-flash" id="hf-bf"></div>`,
    js: flashes,
  };
}

export function scanline(opts: { dropTime: number }): HFComponent {
  return {
    css: `
      .hf-scanline { position: absolute; left: 0; right: 0; height: 3px; background: rgba(0,230,255,0.7); box-shadow: 0 0 16px rgba(0,230,255,0.9); opacity: 0; top: 540px; pointer-events: none; }
      .hf-wash { position: absolute; inset: 0; background: rgba(0,230,255,0.12); opacity: 0; pointer-events: none; }
    `,
    html: `
      <div class="hf-wash" id="hf-wash"></div>
      <div class="hf-scanline" id="hf-scan"></div>
    `,
    js: `
      tl.fromTo("#hf-scan", { y: "-100%", opacity: 1 }, { y: "100vh", opacity: 1, duration: 0.35, ease: "none" }, ${opts.dropTime});
      tl.to("#hf-scan", { opacity: 0, duration: 0.1 }, ${opts.dropTime + 0.35});
      tl.to("#hf-wash", { opacity: 1, duration: 0.1 }, ${opts.dropTime});
      tl.to("#hf-wash", { opacity: 0, duration: 2 }, ${opts.dropTime + 0.5});
    `
  };
}

export function letterboxBars(opts: { dropTime: number }): HFComponent {
  return {
    css: `
      .hf-bar { position: absolute; left: 0; right: 0; background: rgba(0,0,0,0.88); }
      .hf-bar-t { top: 0; height: 90px; transform: translateY(-90px); }
      .hf-bar-b { bottom: 0; height: 90px; transform: translateY(90px); }
    `,
    html: `
      <div class="hf-bar hf-bar-t" id="hf-bt"></div>
      <div class="hf-bar hf-bar-b" id="hf-bb"></div>
    `,
    js: `
      tl.to("#hf-bt", { y: 0, duration: 0.5, ease: "power3.out" }, 0.15);
      tl.to("#hf-bb", { y: 0, duration: 0.5, ease: "power3.out" }, 0.15);
      
      tl.to("#hf-bt", { y: -90, duration: 0.4, ease: "power2.in" }, ${Math.max(2, opts.dropTime - 2.5)});
      tl.to("#hf-bb", { y: 90, duration: 0.4, ease: "power2.in" }, ${Math.max(2, opts.dropTime - 2.5)});
      
      tl.to("#hf-bt", { y: 0, duration: 0.18, ease: "power4.out" }, ${opts.dropTime - 0.18});
      tl.to("#hf-bb", { y: 0, duration: 0.18, ease: "power4.out" }, ${opts.dropTime - 0.18});
    `
  };
}
