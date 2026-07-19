// apps/web/src/components/editor/ClipInspector.tsx

import React from "react";
import { useProjectStore, useIsProcessing } from "../../stores/project-store";

interface ClipInspectorProps {
  selectedClipId: string | null;
  onClose: () => void;
}

export function ClipInspector({ selectedClipId, onClose }: ClipInspectorProps) {
  const project = useProjectStore((s: any) => s.project);
  const setStore = useProjectStore.setState;
  const isProcessing = useIsProcessing();

  if (!selectedClipId || !project) return null;

  // Find the selected clip and its track
  let selectedClip: any = null;
  let selectedTrack: any = null;

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.id === selectedClipId) {
        selectedClip = clip;
        selectedTrack = track;
        break;
      }
    }
    if (selectedClip) break;
  }

  if (!selectedClip) {
    return (
      <div className="p-3 text-xs text-muted-foreground bg-muted/10 border rounded">
        Clip not found in project timeline
      </div>
    );
  }

  // Update helper
  function updateClipField(field: string, value: any) {
    if (isProcessing) return;
    const updatedProject = structuredClone(project);
    for (const track of updatedProject.timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.id === selectedClipId) {
          clip[field] = value;
          break;
        }
      }
    }

    // If we changed duration or startTime, sync the EDL in settings
    const edl = updatedProject.settings?.monet?.edl;
    if (edl) {
      for (const track of edl.timeline.tracks) {
        if (track.type === selectedTrack.type) {
          for (const clip of track.clips) {
            // Match clip by mediaId or meta if IDs aren't fully identical
            if (clip.id === selectedClipId || clip.mediaId === selectedClip.mediaId) {
              clip[field] = value;
              break;
            }
          }
        }
      }
    }

    setStore({ project: updatedProject });
  }

  function updateEffectParam(effectId: string, paramName: string, value: any) {
    if (isProcessing) return;
    const updatedProject = structuredClone(project);
    const updateEffectsInClips = (clips: any[]) => {
      for (const clip of clips) {
        if (clip.id === selectedClipId || clip.mediaId === selectedClip.mediaId) {
          if (clip.effects) {
            for (const fx of clip.effects) {
              if (fx.id === effectId) {
                fx.params = fx.params || {};
                fx.params[paramName] = value;
              }
            }
          }
        }
      }
    };

    for (const track of updatedProject.timeline.tracks) {
      updateEffectsInClips(track.clips);
    }

    const edl = updatedProject.settings?.monet?.edl;
    if (edl) {
      for (const track of edl.timeline.tracks) {
        updateEffectsInClips(track.clips);
      }
    }

    setStore({ project: updatedProject });
  }

  function toggleEffect(effectType: string) {
    if (isProcessing) return;
    const updatedProject = structuredClone(project);
    const toggleInClips = (clips: any[]) => {
      for (const clip of clips) {
        if (clip.id === selectedClipId || clip.mediaId === selectedClip.mediaId) {
          clip.effects = clip.effects || [];
          const index = clip.effects.findIndex((e: any) => e.type === effectType);
          if (index >= 0) {
            // Delete effect
            clip.effects.splice(index, 1);
          } else {
            // Add effect
            clip.effects.push({
              id: `fx-${crypto.randomUUID()}`,
              type: effectType,
              start: clip.startTime,
              duration: clip.duration,
              params: { intensity: 0.5, layer: "foreground" },
            });
          }
        }
      }
    };

    for (const track of updatedProject.timeline.tracks) {
      toggleInClips(track.clips);
    }

    const edl = updatedProject.settings?.monet?.edl;
    if (edl) {
      for (const track of edl.timeline.tracks) {
        toggleInClips(track.clips);
      }
    }

    setStore({ project: updatedProject });
  }

  const hasEffect = (type: string) => {
    return selectedClip.effects?.some((e: any) => e.type === type) ?? false;
  };

  const getEffect = (type: string) => {
    return selectedClip.effects?.find((e: any) => e.type === type);
  };

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm text-xs">
      <div className="flex items-center justify-between border-b pb-1">
        <span className="font-semibold text-primary">Clip Inspector</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground font-bold"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Clip ID:</span>
          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[150px]">
            {selectedClip.id}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Track Type:</span>
          <span className="capitalize bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
            {selectedTrack.type}
          </span>
        </div>

        {/* AI Analysis Panel */}
        {selectedClip.meta?.semanticEvent ? (
          <div className="border rounded bg-muted/20 p-2 mt-1">
            <span className="font-semibold text-primary block mb-1">AI Analysis</span>
            <div className="flex flex-col gap-1 text-[10px]">
              {selectedClip.meta.shotType && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shot Type:</span>
                  <span className="capitalize">{selectedClip.meta.shotType}</span>
                </div>
              )}
              {selectedClip.meta.cameraMotion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Camera Motion:</span>
                  <span className="capitalize">{selectedClip.meta.cameraMotion}</span>
                </div>
              )}
              {selectedClip.meta.semanticEvent.description && (
                <div className="mt-1">
                  <span className="text-muted-foreground">Description:</span>
                  <p className="mt-0.5 italic">{selectedClip.meta.semanticEvent.description}</p>
                </div>
              )}
              {selectedClip.meta.semanticEvent.emotion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Emotion:</span>
                  <span className="capitalize">{selectedClip.meta.semanticEvent.emotion}</span>
                </div>
              )}
              {selectedClip.meta.semanticEvent.event_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event Type:</span>
                  <span className="capitalize">{selectedClip.meta.semanticEvent.event_type}</span>
                </div>
              )}
              {selectedClip.meta.semanticEvent.narrative_role && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Narrative Role:</span>
                  <span className="capitalize font-medium">{selectedClip.meta.semanticEvent.narrative_role}</span>
                </div>
              )}
              {selectedClip.meta.semanticEvent.importance != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Importance:</span>
                  <span>{selectedClip.meta.semanticEvent.importance}/10</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border rounded bg-muted/10 p-2 mt-1 text-[10px] text-muted-foreground italic">
            No AI analysis — manually added
          </div>
        )}

        {/* Start Time */}
        <label className="flex flex-col gap-1 mt-1">
          <span className="text-muted-foreground">Start Time (seconds)</span>
          <input
            type="number"
            step="0.05"
            min="0"
            className="rounded border bg-background px-2 py-1 text-xs"
            value={selectedClip.startTime}
            onChange={(e) => updateClipField("startTime", Number(e.target.value))}
          />
        </label>

        {/* Duration */}
        <label className="flex flex-col gap-1 mt-1">
          <span className="text-muted-foreground">Duration (seconds)</span>
          <input
            type="number"
            step="0.05"
            min="0.1"
            className="rounded border bg-background px-2 py-1 text-xs"
            value={selectedClip.duration}
            onChange={(e) => updateClipField("duration", Number(e.target.value))}
          />
        </label>

        {/* Speed */}
        <label className="flex flex-col gap-1 mt-1">
          <span className="text-muted-foreground">Playback Speed</span>
          <select
            className="rounded border bg-background px-2 py-1 text-xs"
            value={selectedClip.speed || 1}
            onChange={(e) => updateClipField("speed", Number(e.target.value))}
          >
            <option value={0.25}>0.25x (Slo-Mo)</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x (Normal)</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x (Fast-Mo)</option>
            <option value={4}>4.0x (Hyperlapse)</option>
          </select>
        </label>
      </div>

      {/* Real-time Cinematic Effects Toggles */}
      <div className="border-t pt-2 mt-1">
        <span className="font-semibold text-muted-foreground block mb-2">Cinematic FX Stack</span>
        
        <div className="flex flex-col gap-2">
          {/* Flash */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Impact Flash</span>
              <input
                type="checkbox"
                checked={hasEffect("impact_flash")}
                onChange={() => toggleEffect("impact_flash")}
              />
            </label>
            {hasEffect("impact_flash") && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Intensity:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={getEffect("impact_flash")?.params?.intensity ?? 0.5}
                  onChange={(e) => updateEffectParam(getEffect("impact_flash").id, "intensity", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

          {/* Shake */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Camera Shake</span>
              <input
                type="checkbox"
                checked={hasEffect("context_shake")}
                onChange={() => toggleEffect("context_shake")}
              />
            </label>
            {hasEffect("context_shake") && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Intensity:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={getEffect("context_shake")?.params?.intensity ?? 0.4}
                  onChange={(e) => updateEffectParam(getEffect("context_shake").id, "intensity", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

          {/* Player Glow */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Player Glow (SAM)</span>
              <input
                type="checkbox"
                checked={hasEffect("player_glow") || hasEffect("subject_glow")}
                onChange={() => toggleEffect("player_glow")}
              />
            </label>
            {(hasEffect("player_glow") || hasEffect("subject_glow")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Neon Color:</span>
                  <input
                    type="color"
                    value={getEffect("player_glow")?.params?.color ?? "#00ffff"}
                    onChange={(e) => updateEffectParam(getEffect("player_glow").id, "color", e.target.value)}
                    className="w-6 h-4 border p-0 rounded cursor-pointer bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Blur:</span>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={getEffect("player_glow")?.params?.blur ?? 25}
                    onChange={(e) => updateEffectParam(getEffect("player_glow").id, "blur", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Background Blur */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Background Blur</span>
              <input
                type="checkbox"
                checked={hasEffect("background_blur") || hasEffect("subject_blur")}
                onChange={() => toggleEffect("background_blur")}
              />
            </label>
            {(hasEffect("background_blur") || hasEffect("subject_blur")) && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Blur:</span>
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={getEffect("background_blur")?.params?.blur ?? 12}
                  onChange={(e) => updateEffectParam(getEffect("background_blur").id, "blur", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

          {/* Camera Blur */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Camera Blur</span>
              <input
                type="checkbox"
                checked={hasEffect("camera_blur") || hasEffect("camera-blur") || hasEffect("cameraBlur")}
                onChange={() => toggleEffect("camera_blur")}
              />
            </label>
            {(hasEffect("camera_blur") || hasEffect("camera-blur") || hasEffect("cameraBlur")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Radius:</span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={getEffect("camera_blur")?.params?.blurRadius ?? 15}
                    onChange={(e) => updateEffectParam((getEffect("camera_blur") || getEffect("camera-blur") || getEffect("cameraBlur")).id, "blurRadius", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Directional Blur */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Directional Blur</span>
              <input
                type="checkbox"
                checked={hasEffect("directional_blur") || hasEffect("directional-blur") || hasEffect("directionalBlur")}
                onChange={() => toggleEffect("directional_blur")}
              />
            </label>
            {(hasEffect("directional_blur") || hasEffect("directional-blur") || hasEffect("directionalBlur")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Angle (°):</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={getEffect("directional_blur")?.params?.direction ?? 90}
                    onChange={(e) => updateEffectParam((getEffect("directional_blur") || getEffect("directional-blur") || getEffect("directionalBlur")).id, "direction", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Length:</span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={getEffect("directional_blur")?.params?.blurLength ?? 15}
                    onChange={(e) => updateEffectParam((getEffect("directional_blur") || getEffect("directional-blur") || getEffect("directionalBlur")).id, "blurLength", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Gaussian Blur */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Gaussian Blur</span>
              <input
                type="checkbox"
                checked={hasEffect("gaussian_blur") || hasEffect("gaussian-blur") || hasEffect("gaussianBlur")}
                onChange={() => toggleEffect("gaussian_blur")}
              />
            </label>
            {(hasEffect("gaussian_blur") || hasEffect("gaussian-blur") || hasEffect("gaussianBlur")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Blurriness:</span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={getEffect("gaussian_blur")?.params?.blurriness ?? 10}
                    onChange={(e) => updateEffectParam((getEffect("gaussian_blur") || getEffect("gaussian-blur") || getEffect("gaussianBlur")).id, "blurriness", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Dimensions:</span>
                  <select
                    value={getEffect("gaussian_blur")?.params?.dimensions ?? "horizontal and vertical"}
                    onChange={(e) => updateEffectParam((getEffect("gaussian_blur") || getEffect("gaussian-blur") || getEffect("gaussianBlur")).id, "dimensions", e.target.value)}
                    className="rounded border bg-background px-1 py-0.5 text-[10px] w-2/3"
                  >
                    <option value="horizontal and vertical">Horizontal & Vertical</option>
                    <option value="horizontal">Horizontal Only</option>
                    <option value="vertical">Vertical Only</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Sharpen */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Sharpen</span>
              <input
                type="checkbox"
                checked={hasEffect("sharpen")}
                onChange={() => toggleEffect("sharpen")}
              />
            </label>
            {hasEffect("sharpen") && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Amount (%):</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={getEffect("sharpen")?.params?.amount ?? 50}
                  onChange={(e) => updateEffectParam(getEffect("sharpen").id, "amount", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

          {/* Unsharp Mask */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Unsharp Mask</span>
              <input
                type="checkbox"
                checked={hasEffect("unsharp_mask") || hasEffect("unsharp-mask") || hasEffect("unsharpMask")}
                onChange={() => toggleEffect("unsharp_mask")}
              />
            </label>
            {(hasEffect("unsharp_mask") || hasEffect("unsharp-mask") || hasEffect("unsharpMask")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Radius:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="10.0"
                    step="0.1"
                    value={getEffect("unsharp_mask")?.params?.radius ?? 2.0}
                    onChange={(e) => updateEffectParam((getEffect("unsharp_mask") || getEffect("unsharp-mask") || getEffect("unsharpMask")).id, "radius", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Amount (%):</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={getEffect("unsharp_mask")?.params?.amount ?? 50}
                    onChange={(e) => updateEffectParam((getEffect("unsharp_mask") || getEffect("unsharp-mask") || getEffect("unsharpMask")).id, "amount", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reduce Interlace Flicker */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Reduce Interlace Flicker</span>
              <input
                type="checkbox"
                checked={hasEffect("reduce_interlace_flicker") || hasEffect("reduce-interlace-flicker") || hasEffect("reduceInterlaceFlicker")}
                onChange={() => toggleEffect("reduce_interlace_flicker")}
              />
            </label>
            {(hasEffect("reduce_interlace_flicker") || hasEffect("reduce-interlace-flicker") || hasEffect("reduceInterlaceFlicker")) && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Softness:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={getEffect("reduce_interlace_flicker")?.params?.softness ?? 0.5}
                  onChange={(e) => updateEffectParam((getEffect("reduce_interlace_flicker") || getEffect("reduce-interlace-flicker") || getEffect("reduceInterlaceFlicker")).id, "softness", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

          {/* Invert */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Invert Color Channels</span>
              <input
                type="checkbox"
                checked={hasEffect("invert")}
                onChange={() => toggleEffect("invert")}
              />
            </label>
            {hasEffect("invert") && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Blend Original:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={getEffect("invert")?.params?.blend ?? 0}
                    onChange={(e) => updateEffectParam(getEffect("invert").id, "blend", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Channel:</span>
                  <select
                    value={getEffect("invert")?.params?.channel ?? "RGB"}
                    onChange={(e) => updateEffectParam(getEffect("invert").id, "channel", e.target.value)}
                    className="rounded border bg-background px-1 py-0.5 text-[10px] w-2/3"
                  >
                    <option value="RGB">RGB (All Colors)</option>
                    <option value="Red">Red Only</option>
                    <option value="Green">Green Only</option>
                    <option value="Blue">Blue Only</option>
                    <option value="Alpha">Alpha (Transparency)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Echo */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Echo / Motion Trails</span>
              <input
                type="checkbox"
                checked={hasEffect("echo")}
                onChange={() => toggleEffect("echo")}
              />
            </label>
            {hasEffect("echo") && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Decay:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    value={getEffect("echo")?.params?.decay ?? 0.5}
                    onChange={(e) => updateEffectParam(getEffect("echo").id, "decay", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Posterize Time */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">Posterize Time (Lock FPS)</span>
              <input
                type="checkbox"
                checked={hasEffect("posterize_time") || hasEffect("posterize-time") || hasEffect("posterizeTime")}
                onChange={() => toggleEffect("posterize_time")}
              />
            </label>
            {(hasEffect("posterize_time") || hasEffect("posterize-time") || hasEffect("posterizeTime")) && (
              <div className="flex flex-col gap-1.5 mt-1 border-t pt-1.5 border-dashed">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] opacity-75">Target FPS:</span>
                  <input
                    type="range"
                    min="1"
                    max="60"
                    step="1"
                    value={getEffect("posterize_time")?.params?.frameRate ?? 24}
                    onChange={(e) => updateEffectParam((getEffect("posterize_time") || getEffect("posterize-time") || getEffect("posterizeTime")).id, "frameRate", Number(e.target.value))}
                    className="w-2/3 h-1 accent-primary rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Parallax */}
          <div className="flex flex-col gap-1 p-1.5 rounded border bg-muted/10">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium">3D Parallax Panning</span>
              <input
                type="checkbox"
                checked={hasEffect("depth_parallax") || hasEffect("depthParallax")}
                onChange={() => toggleEffect("depth_parallax")}
              />
            </label>
            {(hasEffect("depth_parallax") || hasEffect("depthParallax")) && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] opacity-75">Intensity:</span>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.005"
                  value={getEffect("depth_parallax")?.params?.intensity ?? 0.04}
                  onChange={(e) => updateEffectParam(getEffect("depth_parallax").id, "intensity", Number(e.target.value))}
                  className="w-full h-1 accent-primary rounded-lg appearance-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
