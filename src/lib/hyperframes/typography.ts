import { HFComponent } from "./core";

export function kineticText(opts: { text: string; subtitle?: string; startTime?: number; dropTime: number }): HFComponent {
  const st = opts.startTime ?? 0.5;
  const dt = opts.dropTime;
  
  return {
    css: `
      .hf-typography-stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
      .hf-kinetic-title {
        font-size: 148px; font-weight: 900; letter-spacing: 0.06em; line-height: 1;
        color: #fff; text-align: center;
        text-shadow: 0 0 30px rgba(0,230,255,0.9), 0 0 80px rgba(0,230,255,0.5), 0 0 160px rgba(0,230,255,0.25);
        opacity: 0;
      }
      .hf-kinetic-sub {
        font-size: 28px; font-weight: 400; letter-spacing: 0.38em; text-transform: uppercase;
        color: rgba(0,230,255,0.85); text-align: center; opacity: 0;
      }
    `,
    html: `
      <div class="hf-typography-stage">
        <div class="hf-kinetic-title" id="hf-kt">${opts.text}</div>
        ${opts.subtitle ? `<div class="hf-kinetic-sub" id="hf-ks">${opts.subtitle}</div>` : ""}
      </div>
    `,
    js: `
      tl.to("#hf-kt", { opacity: 1, y: 0, duration: 0.7, ease: "expo.out" }, ${st});
      tl.fromTo("#hf-kt", { scaleX: 1.04 }, { scaleX: 1, duration: 0.7, ease: "expo.out" }, ${st});
      ${opts.subtitle ? `tl.to("#hf-ks", { opacity: 1, duration: 0.5, ease: "power2.out" }, ${st + 0.35});` : ""}
      
      // Intro exit
      tl.to("#hf-kt, #hf-ks", { opacity: 0, y: -22, duration: 0.4, ease: "power2.in" }, ${Math.max(st + 2, dt - 2)});
      
      // Re-appear at drop
      tl.fromTo("#hf-kt", { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }, ${dt});
      tl.to("#hf-kt", { opacity: 0, duration: 0.5 }, ${dt + 1.5});
    `
  };
}
