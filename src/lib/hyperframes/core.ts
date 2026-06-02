export interface HFComponent {
  css: string;
  html: string;
  js: string;
}

export function buildComposition(components: HFComponent[], duration: number): string {
  const cssBase = `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px; height: 1080px;
      overflow: hidden;
      background: transparent;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
  `;

  const seekController = `
    window.__timelines = window.__timelines || {};
    window.__timelines["monet-overlay"] = tl;
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'hf-seek') return;
      var t = Number(e.data.time);
      if (isFinite(t)) tl.seek(t, false);
    });
  `;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
${cssBase}
${components.map((c) => c.css).join("\n")}
</style>
</head>
<body>
${components.map((c) => c.html).join("\n")}
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
(function() {
  const tl = gsap.timeline({ paused: true });
  ${seekController}
  ${components.map((c) => c.js).join("\n")}
})();
</script>
</body>
</html>`;
}
