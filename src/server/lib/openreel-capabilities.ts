export function getOpenReelCapabilityContract(): string {
  return `
## OpenReel Editing Capability Contract (Autonomous Control Plane)

You are allowed to author and modify these EDL surfaces directly. Treat them as executable editing operations.

### 1) Core Timeline Control
- Re-time shots via timing.startTime, timing.duration, timing.speed
- Re-sequence clips while preserving non-overlap and total-duration constraints
- Use transition.type and transition.duration to shape rhythm

### 2) Motion Tracking (Integrated)
- You may emit motionTracks[] with keyframes for tracked subjects/objects
- Motion track keyframe fields:
  - time: source clip time (seconds)
  - x, y: normalized position in [-1, 1]
  - scale, rotation, confidence: optional
- method must be one of: feature | face | object

### 3) Tracked Overlays (Integrated)
- You may emit textOverlays[] for tracked titles/callouts
- Overlay may be linked to tracking.trackId
- tracking.mode:
  - follow: overlay moves with track
  - behind_subject: overlay intended for occlusion-aware compositing
  - planar: overlay pinned to a tracked surface (wall/sign/screen)
- Use offset to art-direct placement relative to track anchor

### 4) Planar Surface Tracking
- You may emit planarTracks[] with per-keyframe corners (TL, TR, BR, BL)
- planar track keyframe fields:
  - time: source clip time (seconds)
  - corners: 4 normalized points in [-1, 1]
  - confidence: optional
- Use planar tracking when user asks for text on walls/signage/screens

### 5) Autonomous Editing Behavior
- If user intent implies kinetic titles, annotations, callouts, identify moments and add textOverlays
- If intent asks subject-focused storytelling, emit face/object motionTracks for key shots
- If intent requests environmental typography, emit planarTracks + textOverlays with mode=planar
- If analysis confidence is low, still emit conservative tracks with lower confidence

### 6) Safety / Validity Rules
- Never reference non-existent clipId values
- Keep motionTracks clipId-bound to real shot sources
- Keep planarTracks clipId-bound to real shot sources
- Keep textOverlays inside timeline bounds
- Do not violate beat-sync and pacing requirements
`;
}
