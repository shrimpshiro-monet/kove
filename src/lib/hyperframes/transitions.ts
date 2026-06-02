import { HFComponent } from "./core";

export function lightLeak(opts: { time: number; duration?: number }): HFComponent {
  const dur = opts.duration ?? 0.3;
  const id = `hf-ll-${opts.time.toString().replace('.', '')}`;
  return {
    css: `
      .${id} { position: absolute; inset: 0; background: radial-gradient(circle at 100% 50%, rgba(255,100,50,0.8), transparent 60%); opacity: 0; pointer-events: none; mix-blend-mode: screen; }
    `,
    html: `<div class="${id}" id="${id}"></div>`,
    js: `
      tl.to("#${id}", { opacity: 1, duration: ${dur/2}, ease: "power2.in" }, ${opts.time - dur/2});
      tl.to("#${id}", { opacity: 0, duration: ${dur/2}, ease: "power2.out" }, ${opts.time});
    `
  };
}
