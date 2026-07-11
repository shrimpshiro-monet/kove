# Kove Editing Capabilities
Status filter: beta+ (64 capabilities)

## Edit

- **beat-cut** ✓ — Hard cut at a beat boundary. Used when shots should align with music beats.
  Triggers: cut on the beat, match the beat, sync to the rhythm
- **delete-clip** ✓ — Remove a clip from the timeline. Leaves a gap.
  Triggers: delete this clip, remove this clip, get rid of this
- **freeze-frame** ◐ ⚠️legacy — Beta edit: freeze-frame
  Triggers: freeze-frame
- **move-clip** ✓ — Move a clip to a different position on the timeline.
  Triggers: move this clip, reorder this clip, put this clip earlier
- **posterize-time** ◐ ⚠️legacy — Beta edit: posterize-time
  Triggers: posterize-time
- **speed-ramp** ◐ ⚠️legacy — Beta edit: speed-ramp
  Triggers: speed-ramp
- **speed-static** ✓ — Set a clip's playback speed to a fixed value (0.25x to 4x).
  Triggers: slow this down, speed this up, half speed
- **split-clip** ✓ — Split a clip into two separate clips at a specific time point.
  Triggers: split this clip, cut here, cut this clip in half
- **trim-clip** ✓ — Trim a clip from its start or end edge to shorten or lengthen it.
  Triggers: trim this clip, shorten this clip, cut the beginning
- **undo-redo** ◐ ⚠️legacy — Beta edit: undo-redo
  Triggers: undo-redo

## Effects

- **background-blur** ◐ ⚠️legacy — Beta effect: background-blur
  Triggers: background-blur
- **camera-blur** ◐ ⚠️legacy — Beta effect: camera-blur
  Triggers: camera-blur
- **chromatic-burst** ◐ ⚠️legacy — Beta effect: chromatic-burst
  Triggers: chromatic-burst
- **color-grade** ✓ — Apply color grading — adjust saturation, contrast, brightness, temperature, tint, shadows, midtones, highlights.
  Triggers: color grade, adjust colors, make it warmer
- **color-pulse** ◐ ⚠️legacy — Beta effect: color-pulse
  Triggers: color-pulse
- **directional-blur** ◐ ⚠️legacy — Beta effect: directional-blur
  Triggers: directional-blur
- **echo** ◐ ⚠️legacy — Beta effect: echo
  Triggers: echo
- **flash** ✓ — Impact flash — white frame overlay with opacity fade-out.
  Triggers: flash, white flash, impact flash
- **gaussian-blur** ◐ ⚠️legacy — Beta effect: gaussian-blur
  Triggers: gaussian-blur
- **gl-transition-effect** ◐ ⚠️legacy — Beta effect: gl-transition-effect
  Triggers: gl-transition-effect
- **interlace-flicker** ◐ ⚠️legacy — Beta effect: interlace-flicker
  Triggers: interlace-flicker
- **invert-color** ◐ ⚠️legacy — Beta effect: invert-color
  Triggers: invert-color
- **parallax-3d** ◐ ⚠️legacy — Beta effect: parallax-3d
  Triggers: parallax-3d
- **player-glow** ◐ ⚠️legacy — Beta effect: player-glow
  Triggers: player-glow
- **pull-out** ✓ — Slow zoom-out Ken Burns effect. Scale decreases from ~1.15 to 1.0.
  Triggers: zoom out, pull out, ken burns out
- **push-in** ✓ — Slow zoom-in Ken Burns effect. Scale increases from 1.0 to ~1.2.
  Triggers: zoom in, push in, ken burns in
- **shake** ✓ — Impact camera shake. 18Hz procedural jitter with exponential decay.
  Triggers: shake, camera shake, impact shake
- **sharpen** ◐ ⚠️legacy — Beta effect: sharpen
  Triggers: sharpen
- **speed-ramp-effect** ◐ ⚠️legacy — Beta effect: speed-ramp-effect
  Triggers: speed-ramp-effect
- **unsharp-mask** ◐ ⚠️legacy — Beta effect: unsharp-mask
  Triggers: unsharp-mask
- **vignette-punch** ◐ ⚠️legacy — Beta effect: vignette-punch
  Triggers: vignette-punch

## Overlays

- **kinetic-caption** ◐ ⚠️legacy — Beta overlay: kinetic-caption
  Triggers: kinetic-caption
- **lower-third** ◐ ⚠️legacy — Beta overlay: lower-third
  Triggers: lower-third
- **subtitle-auto** ◐ ⚠️legacy — Beta overlay: subtitle-auto
  Triggers: subtitle-auto
- **text-overlay** ✓ — Add text overlay with font, size, color, position, and animation.
  Triggers: add text, text overlay, title
- **title-card** ◐ ⚠️legacy — Beta overlay: title-card
  Triggers: title-card

## Audio

- **audio-mixing** ◐ ⚠️legacy — Beta audio: audio-mixing
  Triggers: audio-mixing
- **beat-sync** ✓ — Sync clip edits to audio beats — cut on beats, ramp speed, or trigger effects.
  Triggers: sync to beat, match the beat, cut on beat
- **ducking** ✓ — Auto-duck music volume when voice/dialogue is present.
  Triggers: duck the music, lower music under voice, audio ducking
- **audio-fade** ✓ — Fade audio in or out over a specified duration.
  Triggers: fade in, fade out, fade the audio
- **sfx-synthesis** ◐ ⚠️legacy — Beta audio: sfx-synthesis
  Triggers: sfx-synthesis
- **volume** ✓ — Set clip audio volume (0.0 = silent, 1.0 = normal).
  Triggers: volume, make it louder, make it quieter

## Transitions

- **whip-pan** ✓ — whip-pan transition between two clips.
  Triggers: whip-pan, whip-pan transition
- **barn-doors** ✓ — barn-doors transition between two clips.
  Triggers: barn-doors, barn-doors transition
- **blur** ✓ — blur transition between two clips.
  Triggers: blur, blur transition
- **crossfade** ✓ — crossfade transition between two clips.
  Triggers: crossfade, crossfade transition
- **dip-to-black** ✓ — dip-to-black transition between two clips.
  Triggers: dip-to-black, dip-to-black transition
- **dissolve** ✓ — dissolve transition between two clips.
  Triggers: dissolve, dissolve transition
- **film-burn** ✓ — film-burn transition between two clips.
  Triggers: film-burn, film-burn transition
- **flash-transition** ✓ — flash-transition transition between two clips.
  Triggers: flash-transition, flash-transition transition
- **gl-transition-experimental** ◐ ⚠️legacy — Experimental GL shader transitions (cube, mosaic, ripple, swirl, dreamy, etc).
  Triggers: cube transition, mosaic transition, ripple transition
- **glitch** ✓ — glitch transition between two clips.
  Triggers: glitch, glitch transition
- **gradient-wipe** ✓ — gradient-wipe transition between two clips.
  Triggers: gradient-wipe, gradient-wipe transition
- **iris** ✓ — iris transition between two clips.
  Triggers: iris, iris transition
- **linear-wipe** ✓ — linear-wipe transition between two clips.
  Triggers: linear-wipe, linear-wipe transition
- **morph** ✓ — morph transition between two clips.
  Triggers: morph, morph transition
- **pinwheel** ✓ — pinwheel transition between two clips.
  Triggers: pinwheel, pinwheel transition
- **pixelate** ✓ — pixelate transition between two clips.
  Triggers: pixelate, pixelate transition
- **radial-wipe** ✓ — radial-wipe transition between two clips.
  Triggers: radial-wipe, radial-wipe transition
- **slide** ✓ — slide transition between two clips.
  Triggers: slide, slide transition
- **spin** ✓ — spin transition between two clips.
  Triggers: spin, spin transition
- **zoom-blur** ✓ — zoom-blur transition between two clips.
  Triggers: zoom-blur, zoom-blur transition

## Camera

- **crop** ✓ — Crop a clip to a specific region.
  Triggers: crop, crop this, cut the edges

## Composition

- **multi-track** ✓ — Multi-track timeline with video, audio, text, and effects tracks.
  Triggers: add track, new track, multi-track

---
✓ = available now  ◐ = coming soon  ○ = planned  ⚠️legacy = needs Zod migration
Only use ✓ capabilities. For ◐/○, tell the user it's coming soon.