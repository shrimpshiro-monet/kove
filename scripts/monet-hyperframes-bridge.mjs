#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function usage() {
  console.log(`Usage:
  node scripts/monet-hyperframes-bridge.mjs \
    --edl <path/to/edl.json> \
    --media-map <path/to/media-map.json> \
    --out <output/dir>

media-map format:
{
  "clip-id-1": "/absolute/or/relative/path-or-url/video1.mp4",
  "clip-id-2": "https://.../video2.mp4",
  "music-id": "/path/music.mp3"
}
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k.startsWith('--')) {
      args[k.slice(2)] = v;
      i++;
    }
  }
  return args;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildComposition(edl, mediaMap) {
  const width = Number(edl?.timeline?.resolution?.width || 1920);
  const height = Number(edl?.timeline?.resolution?.height || 1080);
  const fps = Number(edl?.timeline?.fps || 30);
  const duration = Number(edl?.timeline?.duration || 30);

  const videoClips = (edl?.shots || []).map((shot, i) => {
    const clipId = shot?.source?.clipId;
    const src = mediaMap[clipId] || '';
    const start = Number(shot?.timing?.startTime || 0);
    const clipDuration = Number(shot?.timing?.duration || 1);
    const inPoint = Number(shot?.source?.inPoint || 0);
    const speed = Number(shot?.timing?.speed || 1);
    const transition = shot?.transition?.type || 'cut';

    const opacity = transition === 'crossfade' ? 0.999 : 1;
    const id = `shot_${i}`;

    return `
      <video
        id="${id}"
        class="clip"
        src="${escapeHtml(src)}"
        muted
        playsinline
        data-start="${start}"
        data-duration="${clipDuration}"
        data-track-index="0"
        data-media-offset="${inPoint}"
        data-playback-rate="${speed}"
        style="opacity:${opacity};"
      ></video>`;
  }).join('\n');

  const musicSrc = edl?.music?.sourceId ? mediaMap[edl.music.sourceId] : null;
  const audioClip = musicSrc
    ? `
      <audio
        id="music"
        src="${escapeHtml(musicSrc)}"
        data-start="0"
        data-duration="${duration}"
        data-track-index="10"
        data-volume="${Number(edl?.music?.volume ?? 0.8)}"
      ></audio>`
    : '';

  const captions = (edl?.textOverlays || []).map((overlay, idx) => {
    const start = Number(overlay?.startTime || 0);
    const d = Math.max(0.1, Number(overlay?.endTime || start + 1) - start);
    const text = escapeHtml(overlay?.text || '');
    return `
      <div class="caption clip" data-start="${start}" data-duration="${d}" data-track-index="20" id="caption_${idx}">${text}</div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>Monet HyperFrames Export</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #000;
      }
      #stage {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #000;
      }
      video.clip {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .caption {
        position: absolute;
        left: 50%;
        bottom: 8%;
        transform: translateX(-50%);
        color: #fff;
        font: 700 52px/1.1 system-ui, sans-serif;
        text-shadow: 0 2px 16px rgba(0,0,0,.65);
        padding: 10px 16px;
        border-radius: 8px;
        background: rgba(0,0,0,.25);
        letter-spacing: 0.02em;
      }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${width}"
      data-height="${height}"
      data-fps="${fps}"
    >
      ${videoClips}
      ${audioClip}
      ${captions}

      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });

        // Simple crossfade pass based on clip transition metadata.
        ${ (edl?.shots || []).map((shot, i) => {
            if (shot?.transition?.type !== 'crossfade') return '';
            const id = `#shot_${i}`;
            const start = Number(shot?.timing?.startTime || 0);
            const tDur = Math.max(0.1, Number(shot?.transition?.duration || 0.25));
            return `tl.fromTo('${id}', { opacity: 0 }, { opacity: 1, duration: ${tDur}, ease: 'power2.inOut' }, ${start});`;
          }).join('\n        ')
        }

        window.__timelines.main = tl;
      </script>
    </div>
  </body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv);
  const edlPath = args.edl;
  const outDir = args.out || 'hyperframes-out';

  if (!edlPath) {
    usage();
    process.exit(1);
  }

  const mediaMapPath = args['media-map'];
  const mediaMap = mediaMapPath ? JSON.parse(readFileSync(mediaMapPath, 'utf8')) : {};
  const edl = JSON.parse(readFileSync(edlPath, 'utf8'));

  const outAbs = resolve(outDir);
  mkdirSync(outAbs, { recursive: true });

  const indexHtml = buildComposition(edl, mediaMap);
  writeFileSync(resolve(outAbs, 'index.html'), indexHtml, 'utf8');
  writeFileSync(
    resolve(outAbs, 'meta.json'),
    JSON.stringify(
      {
        name: edl?.metadata?.title || 'Monet HyperFrames Composition',
        generatedAt: new Date().toISOString(),
        source: {
          type: 'monet-edl',
          version: edl?.version || '1.0.0',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Generated HyperFrames composition at: ${resolve(outAbs, 'index.html')}`);
  console.log('Next: npx hyperframes preview ' + resolve(outAbs, 'index.html'));
  console.log('Or:   npx hyperframes render ' + resolve(outAbs, 'index.html') + ' -o ' + resolve(outAbs, 'render.mp4'));
}

main();
