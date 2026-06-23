// apps/web/src/engine/audio/audio-engine.ts

import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface AudioEngine {
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  triggerSFX(type: "whoosh" | "hit" | "bass_drop"): void;
  update(time: number): void;
  destroy(): void;
}

export function createAudioEngine(edl: MonetEDL): AudioEngine {
  // SSR Safety
  if (typeof window === "undefined") {
    return {
      async play() {},
      pause() {},
      seek() {},
      getCurrentTime() { return 0; },
      triggerSFX() {},
      update() {},
      destroy() {},
    };
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  // Create Node Architecture
  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  masterGain.connect(audioCtx.destination);

  const musicGain = audioCtx.createGain();
  musicGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
  musicGain.connect(masterGain);

  const voiceGain = audioCtx.createGain();
  voiceGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
  voiceGain.connect(masterGain);

  const sfxGain = audioCtx.createGain();
  sfxGain.gain.setValueAtTime(0.9, audioCtx.currentTime);
  sfxGain.connect(masterGain);

  // Load primary background track if any
  const firstAudio = Object.values(edl.assets.audio || {})[0];
  const audio = firstAudio ? new Audio(firstAudio.path) : null;
  
  if (audio) {
    audio.crossOrigin = "anonymous";
    try {
      const primarySource = audioCtx.createMediaElementSource(audio);
      primarySource.connect(musicGain);
    } catch (err) {
      console.warn("[AudioEngine] Primary audio source connect bypass", err);
    }
  }

  // Map other audio elements (including voice tracks)
  const audioElements = new Map<string, HTMLAudioElement>();
  const audioClips: { clip: Clip; element: HTMLAudioElement; source: MediaElementAudioSourceNode }[] = [];

  for (const track of edl.timeline.tracks) {
    if (track.type !== "audio") continue;

    for (const clip of track.clips) {
      // Avoid duplicating the primary background audio
      if (firstAudio && clip.mediaId === firstAudio.id) continue;

      const asset = edl.assets.audio?.[clip.mediaId] || edl.assets.media?.[clip.mediaId];
      if (!asset) continue;

      let el = audioElements.get(asset.id);
      if (!el) {
        el = new Audio(asset.path);
        el.crossOrigin = "anonymous";
        el.muted = false;
        audioElements.set(asset.id, el);
      }

      try {
        const source = audioCtx.createMediaElementSource(el);
        
        // Connect voice/dialogue to voiceGain, background/music to musicGain
        const isVoice = clip.meta?.tags?.toString().includes("voice") || clip.meta?.tags?.toString().includes("dialogue");
        source.connect(isVoice ? voiceGain : musicGain);

        audioClips.push({ clip, element: el, source });
      } catch (err) {
        console.warn("[AudioEngine] Secondary source connection bypass", err);
      }
    }
  }

  let startTime = 0;
  let pausedAt = 0;
  let playing = false;

  function setAudioElementsPlaying(state: boolean) {
    for (const item of audioClips) {
      if (state) {
        const localTime = (pausedAt - item.clip.startTime) * (item.clip.speed || 1);
        const start = item.clip.startTime;
        const end = item.clip.startTime + item.clip.duration;

        if (pausedAt >= start && pausedAt <= end) {
          item.element.currentTime = localTime + item.clip.inPoint;
          item.element.play().catch(() => {});
        } else {
          item.element.pause();
        }
      } else {
        item.element.pause();
      }
    }
  }

  return {
    async play(): Promise<void> {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      if (!playing) {
        if (audio) {
          audio.currentTime = pausedAt;
          await audio.play().catch(() => {});
        }

        setAudioElementsPlaying(true);

        startTime = audioCtx.currentTime - pausedAt;
        playing = true;
      }
    },

    pause(): void {
      if (playing) {
        if (audio) {
          audio.pause();
          pausedAt = audio.currentTime;
        } else {
          pausedAt = audioCtx.currentTime - startTime;
        }

        setAudioElementsPlaying(false);
        playing = false;
      }
    },

    seek(time: number): void {
      pausedAt = Math.max(0, time);
      if (audio) {
        audio.currentTime = pausedAt;
      }

      for (const item of audioClips) {
        const localTime = (time - item.clip.startTime) * (item.clip.speed || 1);
        const start = item.clip.startTime;
        const end = item.clip.startTime + item.clip.duration;

        if (time >= start && time <= end) {
          item.element.currentTime = localTime + item.clip.inPoint;
          if (playing) {
            item.element.play().catch(() => {});
          }
        } else {
          item.element.pause();
        }
      }

      if (playing) {
        startTime = audioCtx.currentTime - pausedAt;
      }
    },

    getCurrentTime(): number {
      if (!playing) {
        return pausedAt;
      }

      return audioCtx.currentTime - startTime;
    },

    triggerSFX(type: "whoosh" | "hit" | "bass_drop") {
      const now = audioCtx.currentTime;

      if (type === "bass_drop") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(sfxGain);

        osc.type = "sine";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 1.8);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.8);

        osc.start(now);
        osc.stop(now + 1.8);
      } else if (type === "whoosh") {
        const bufferSize = audioCtx.sampleRate * 1.0;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(150, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.5);
        filter.frequency.exponentialRampToValueAtTime(180, now + 1.0);
        filter.Q.setValueAtTime(4, now);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 0.5);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.0);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);

        noise.start(now);
        noise.stop(now + 1.0);
      } else if (type === "hit") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(sfxGain);

        osc.start(now);
        osc.stop(now + 0.4);
      }
    },

    update(time: number) {
      if (!playing) return;
      pausedAt = time;

      let dialogueActive = false;

      for (const item of audioClips) {
        const start = item.clip.startTime;
        const end = item.clip.startTime + item.clip.duration;

        if (time >= start && time <= end) {
          const isVoice = item.clip.meta?.tags?.toString().includes("voice") || item.clip.meta?.tags?.toString().includes("dialogue");
          if (isVoice) {
            dialogueActive = true;
          }

          if (item.element.paused) {
            const localTime = (time - item.clip.startTime) * (item.clip.speed || 1);
            item.element.currentTime = localTime + item.clip.inPoint;
            item.element.play().catch(() => {});
          }
        } else {
          if (!item.element.paused) {
            item.element.pause();
          }
        }
      }

      const targetMusicGain = dialogueActive ? 0.22 : 1.0;
      musicGain.gain.setTargetAtTime(targetMusicGain, audioCtx.currentTime, 0.15);
    },

    destroy() {
      playing = false;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      for (const item of audioClips) {
        item.element.pause();
        item.element.src = "";
      }
      audioCtx.close();
    },
  };
}
