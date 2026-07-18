import type { Clip, ProjectEDL as MonetEDL, Track } from "@monet/edl";
import { AudioBufferCache } from "./audio-buffer-cache";
import type {
  ActionResult,
  ActiveAudioSource,
  AudioTimelineEngine,
  AudioTimelineState,
  CreateAudioTimelineEngineInput,
  ScheduledAudioClip,
} from "./audio-types";

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function calculateEDLDuration(edl: MonetEDL): number {
  let maxDuration = 0;

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxDuration) {
        maxDuration = end;
      }
    }
  }

  return Math.round(maxDuration * 1000) / 1000;
}

function getAudioTracks(edl: MonetEDL): Track[] {
  return edl.timeline.tracks.filter((track) => track.type === "audio");
}

function buildScheduledAudioClips(edl: MonetEDL): ActionResult<ScheduledAudioClip[]> {
  try {
    const scheduled: ScheduledAudioClip[] = [];

    for (const track of getAudioTracks(edl)) {
      if (track.hidden) {
        continue;
      }

      for (const clip of track.clips) {
        const asset = edl.assets.audio[clip.mediaId];

        if (!asset) {
          return {
            success: false,
            error: {
              code: "AUDIO_ASSET_MISSING",
              message: `Audio clip ${clip.id} references missing asset ${clip.mediaId}`,
            },
          };
        }

        if (!asset.path || asset.path.trim().length === 0) {
          return {
            success: false,
            error: {
              code: "AUDIO_ASSET_PATH_MISSING",
              message: `Audio asset ${asset.id} has no path`,
            },
          };
        }

        if (!isFinitePositiveNumber(clip.duration)) {
          return {
            success: false,
            error: {
              code: "INVALID_AUDIO_CLIP_DURATION",
              message: `Audio clip ${clip.id} has invalid duration`,
            },
          };
        }

        if (clip.outPoint <= clip.inPoint) {
          return {
            success: false,
            error: {
              code: "INVALID_AUDIO_CLIP_RANGE",
              message: `Audio clip ${clip.id} has invalid in/out points`,
            },
          };
        }

        scheduled.push({
          clip,
          asset,
          gain: clampNumber(clip.audio?.gain ?? 1, 0, 3),
          startTime: clip.startTime,
          duration: clip.duration,
          inPoint: Math.max(0, clip.inPoint),
          outPoint: Math.max(clip.inPoint, clip.outPoint),
          speed: clampNumber(clip.speed || 1, 0.25, 4),
          fadeIn: Math.max(0, clip.audio?.fadeIn ?? 0),
          fadeOut: Math.max(0, clip.audio?.fadeOut ?? 0),
        });
      }
    }

    scheduled.sort((a, b) => a.startTime - b.startTime || a.clip.id.localeCompare(b.clip.id));

    return {
      success: true,
      data: scheduled,
    };
  } catch (error) {
    console.error("[AudioTimelineEngine] buildScheduledAudioClips failed", { error });

    return {
      success: false,
      error: {
        code: "AUDIO_SCHEDULE_BUILD_FAILED",
        message: "Failed to build scheduled audio clips",
      },
    };
  }
}

export function createAudioTimelineEngine(
  input: CreateAudioTimelineEngineInput
): ActionResult<AudioTimelineEngine> {
  try {
    const edl = input.edl;

    if (!edl || edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL",
          message: "Expected MonetEDL version 1",
        },
      };
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor && !input.audioContext) {
      return {
        success: false,
        error: {
          code: "AUDIO_CONTEXT_UNAVAILABLE",
          message: "Web Audio API is not available in this browser",
        },
      };
    }

    const context = input.audioContext ?? new AudioContextCtor();
    const bufferCache = new AudioBufferCache(context);
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);

    const scheduleResult = buildScheduledAudioClips(edl);

    if (!scheduleResult.success || !scheduleResult.data) {
      return {
        success: false,
        error: scheduleResult.error ?? {
          code: "AUDIO_SCHEDULE_FAILED",
          message: "Failed to schedule audio clips",
        },
      };
    }

    const scheduledClips = scheduleResult.data;
    const decodedAssetIds = new Set<string>();
    const activeSources = new Map<string, ActiveAudioSource>();
    const duration = calculateEDLDuration(edl);
    const lookaheadSeconds = clampNumber(input.lookaheadSeconds ?? 0.75, 0.1, 3);
    const scheduleIntervalMs = Math.round(clampNumber(input.scheduleIntervalMs ?? 100, 25, 500));

    let loaded = false;
    let playing = false;
    let timelineOffset = 0;
    let contextStartTime = 0;
    let scheduleCursor = 0;
    let schedulerHandle: number | null = null;
    let disposed = false;

    function getTimelineTime(): number {
      if (!playing) {
        return timelineOffset;
      }

      return clampNumber(context.currentTime - contextStartTime, 0, Math.max(duration, 0));
    }

    function stopScheduler(): void {
      if (schedulerHandle !== null) {
        window.clearInterval(schedulerHandle);
        schedulerHandle = null;
      }
    }

    function stopActiveSources(): void {
      for (const active of activeSources.values()) {
        try {
          active.source.stop();
        } catch {
          // Source may already be stopped; intentionally ignored after explicit stop attempt.
        }

        try {
          active.source.disconnect();
          active.gainNode.disconnect();
        } catch {
          // Disconnect can throw for already-disconnected nodes; safe to ignore during cleanup.
        }
      }

      activeSources.clear();
    }

    function resetScheduleCursor(time: number): void {
      let low = 0;
      let high = scheduledClips.length - 1;
      let candidate = scheduledClips.length;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const item = scheduledClips[mid];

        if (!item) {
          candidate = scheduledClips.length;
          break;
        }

        if (item.startTime + item.duration >= time) {
          candidate = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      scheduleCursor = candidate;
    }

    async function scheduleDueClips(): Promise<void> {
      if (!playing || disposed) return;

      const nowTimeline = getTimelineTime();
      const scheduleUntil = nowTimeline + lookaheadSeconds;

      while (scheduleCursor < scheduledClips.length) {
        const scheduledClip = scheduledClips[scheduleCursor];

        if (!scheduledClip) {
          return;
        }

        const clipEnd = scheduledClip.startTime + scheduledClip.duration;

        if (clipEnd < nowTimeline) {
          scheduleCursor += 1;
          continue;
        }

        if (scheduledClip.startTime > scheduleUntil) {
          break;
        }

        const key = `${scheduledClip.clip.id}:${scheduledClip.startTime}:${scheduledClip.inPoint}`;

        if (!activeSources.has(key)) {
          const result = await scheduleClip(scheduledClip, nowTimeline);

          if (!result.success) {
            console.error("[AudioTimelineEngine] scheduleClip failed", {
              clipId: scheduledClip.clip.id,
              error: result.error,
            });
          }
        }

        scheduleCursor += 1;
      }
    }

    async function scheduleClip(
      scheduledClip: ScheduledAudioClip,
      nowTimeline: number
    ): Promise<ActionResult<{ clipId: string }>> {
      try {
        const bufferResult = await bufferCache.getBuffer(scheduledClip.asset.path);

        if (!bufferResult.success || !bufferResult.data) {
          return {
            success: false,
            error: bufferResult.error ?? {
              code: "AUDIO_BUFFER_MISSING",
              message: `Could not load audio buffer for ${scheduledClip.asset.id}`,
            },
          };
        }

        const buffer = bufferResult.data;
        const source = context.createBufferSource();
        const gainNode = context.createGain();

        source.buffer = buffer;
        source.playbackRate.value = scheduledClip.speed;
        gainNode.gain.value = scheduledClip.gain;

        const clipElapsed = Math.max(0, nowTimeline - scheduledClip.startTime);
        const remainingDuration = Math.max(0.001, scheduledClip.duration - clipElapsed);
        const sourceOffset = clampNumber(
          scheduledClip.inPoint + clipElapsed * scheduledClip.speed,
          0,
          Math.max(0, buffer.duration - 0.001)
        );

        const contextWhen = Math.max(
          context.currentTime,
          contextStartTime + scheduledClip.startTime
        );

        // Apply fade-in envelope
        if (scheduledClip.fadeIn > 0 && scheduledClip.fadeIn < remainingDuration) {
          gainNode.gain.setValueAtTime(0, contextWhen);
          gainNode.gain.linearRampToValueAtTime(
            scheduledClip.gain,
            contextWhen + scheduledClip.fadeIn
          );
        }

        // Apply fade-out envelope (guard against overlap with fade-in)
        if (scheduledClip.fadeOut > 0 && scheduledClip.fadeOut < remainingDuration) {
          const fadeOutStart = Math.max(
            contextWhen + scheduledClip.fadeIn,
            contextWhen + Math.max(0, remainingDuration - scheduledClip.fadeOut)
          );
          gainNode.gain.setValueAtTime(scheduledClip.gain, fadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0, fadeOutStart + scheduledClip.fadeOut);
        }

        source.connect(gainNode);

        const key = `${scheduledClip.clip.id}:${scheduledClip.startTime}:${scheduledClip.inPoint}`;

        activeSources.set(key, {
          clipId: scheduledClip.clip.id,
          source,
          gainNode,
          startedAtContextTime: contextWhen,
          scheduledTimelineTime: scheduledClip.startTime,
        });

        source.onended = () => {
          activeSources.delete(key);
          try {
            source.disconnect();
            gainNode.disconnect();
          } catch {
            // Best-effort cleanup.
          }
        };

        source.start(contextWhen, sourceOffset, remainingDuration);

        return {
          success: true,
          data: {
            clipId: scheduledClip.clip.id,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] scheduleClip threw", {
          error,
          clipId: scheduledClip.clip.id,
          mediaId: scheduledClip.clip.mediaId,
        });

        return {
          success: false,
          error: {
            code: "AUDIO_CLIP_SCHEDULE_FAILED",
            message: `Failed to schedule audio clip ${scheduledClip.clip.id}`,
          },
        };
      }
    }

    async function load(): Promise<ActionResult<{ decodedAssets: number; scheduledClips: number }>> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "AUDIO_ENGINE_DISPOSED",
              message: "Audio engine has been disposed",
            },
          };
        }

        const uniqueAssets = new Map<string, string>();

        for (const clip of scheduledClips) {
          uniqueAssets.set(clip.asset.id, clip.asset.path);
        }

        for (const [assetId, path] of uniqueAssets.entries()) {
          const result = await bufferCache.getBuffer(path);

          if (!result.success) {
            return {
              success: false,
              error: result.error ?? {
                code: "AUDIO_PRELOAD_FAILED",
                message: `Failed to preload audio asset ${assetId}`,
              },
            };
          }

          decodedAssetIds.add(assetId);
        }

        loaded = true;

        return {
          success: true,
          data: {
            decodedAssets: decodedAssetIds.size,
            scheduledClips: scheduledClips.length,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] load failed", { error });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_LOAD_FAILED",
            message: "Failed to load audio timeline engine",
          },
        };
      }
    }

    async function play(): Promise<ActionResult<{ startedAt: number }>> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "AUDIO_ENGINE_DISPOSED",
              message: "Audio engine has been disposed",
            },
          };
        }

        if (!loaded) {
          const loadResult = await load();

          if (!loadResult.success) {
            return {
              success: false,
              error: loadResult.error ?? {
                code: "AUDIO_LOAD_FAILED",
                message: "Audio engine failed to load before play",
              },
            };
          }
        }

        if (context.state === "suspended") {
          await context.resume();
        }

        if (playing) {
          return {
            success: true,
            data: {
              startedAt: getTimelineTime(),
            },
          };
        }

        stopActiveSources();
        resetScheduleCursor(timelineOffset);

        contextStartTime = context.currentTime - timelineOffset;
        playing = true;

        await scheduleDueClips();

        stopScheduler();
        schedulerHandle = window.setInterval(() => {
          scheduleDueClips().catch((error) => {
            console.error("[AudioTimelineEngine] scheduler tick failed", { error });
          });
        }, scheduleIntervalMs);

        return {
          success: true,
          data: {
            startedAt: timelineOffset,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] play failed", { error });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_PLAY_FAILED",
            message: "Failed to start audio playback",
          },
        };
      }
    }

    function pause(): ActionResult<{ pausedAt: number }> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "AUDIO_ENGINE_DISPOSED",
              message: "Audio engine has been disposed",
            },
          };
        }

        timelineOffset = getTimelineTime();
        playing = false;

        stopScheduler();
        stopActiveSources();

        return {
          success: true,
          data: {
            pausedAt: timelineOffset,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] pause failed", { error });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_PAUSE_FAILED",
            message: "Failed to pause audio playback",
          },
        };
      }
    }

    function seek(time: number): ActionResult<{ time: number }> {
      try {
        if (disposed) {
          return {
            success: false,
            error: {
              code: "AUDIO_ENGINE_DISPOSED",
              message: "Audio engine has been disposed",
            },
          };
        }

        const nextTime = clampNumber(time, 0, Math.max(duration, 0));

        timelineOffset = nextTime;
        contextStartTime = context.currentTime - timelineOffset;

        stopActiveSources();
        resetScheduleCursor(nextTime);

        if (playing) {
          scheduleDueClips().catch((error) => {
            console.error("[AudioTimelineEngine] seek reschedule failed", { error, nextTime });
          });
        }

        return {
          success: true,
          data: {
            time: nextTime,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] seek failed", { error, time });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_SEEK_FAILED",
            message: "Failed to seek audio engine",
          },
        };
      }
    }

    function stop(): ActionResult<{ stoppedAt: number }> {
      try {
        const stoppedAt = getTimelineTime();
        playing = false;
        timelineOffset = 0;
        contextStartTime = context.currentTime;

        stopScheduler();
        stopActiveSources();
        resetScheduleCursor(0);

        return {
          success: true,
          data: {
            stoppedAt,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] stop failed", { error });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_STOP_FAILED",
            message: "Failed to stop audio engine",
          },
        };
      }
    }

    function dispose(): ActionResult<{ disposed: true }> {
      try {
        stopScheduler();
        stopActiveSources();
        bufferCache.clear();
        masterGain.disconnect();

        disposed = true;
        playing = false;
        loaded = false;

        if (!input.audioContext && context.state !== "closed") {
          context.close().catch((error) => {
            console.error("[AudioTimelineEngine] context close failed", { error });
          });
        }

        return {
          success: true,
          data: {
            disposed: true,
          },
        };
      } catch (error) {
        console.error("[AudioTimelineEngine] dispose failed", { error });

        return {
          success: false,
          error: {
            code: "AUDIO_ENGINE_DISPOSE_FAILED",
            message: "Failed to dispose audio engine",
          },
        };
      }
    }

    function getState(): AudioTimelineState {
      return {
        loaded,
        playing,
        timelineOffset,
        contextStartTime,
        duration,
        decodedAssetCount: decodedAssetIds.size,
        scheduledClipCount: scheduledClips.length,
      };
    }

    return {
      success: true,
      data: {
        load,
        play,
        pause,
        seek,
        stop,
        dispose,
        getTimelineTime,
        getState,
      },
    };
  } catch (error) {
    console.error("[AudioTimelineEngine] create failed", { error });

    return {
      success: false,
      error: {
        code: "AUDIO_ENGINE_CREATE_FAILED",
        message: "Failed to create audio timeline engine",
      },
    };
  }
}
