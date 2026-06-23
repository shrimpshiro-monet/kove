export type FeaturePriority =
  | "v-beta-1"
  | "v-beta-1 partial"
  | "v-beta-2"
  | "later";

export type FeatureEngine =
  | "node"
  | "python-audio"
  | "python-ai"
  | "python-render"
  | "browser"
  | "render"
  | "editor";

export interface MonetFeature {
  id: string;
  label: string;
  priority: FeaturePriority;
  engines: FeatureEngine[];
  folderTargets: string[];
  edlObjects: string[];
  enabledByDefault: boolean;
  requiresGpu: boolean;
  renderCritical: boolean;
}

export const MONET_FEATURES: MonetFeature[] = [
  {
    id: "smart-shot-selection",
    label: "Smart Shot Selection / AI Culling",
    priority: "v-beta-1",
    engines: ["node", "python-ai"],
    folderTargets: ["packages/feature-registry", "workers/python-ai/scene_detect", "packages/edl"],
    edlObjects: ["shots[]", "segmentScores", "replaceShotControls"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "blueprint-preview",
    label: "Blueprint Preview Mode",
    priority: "v-beta-1",
    engines: ["browser", "editor"],
    folderTargets: ["apps/web/src/components/preview/blueprint", "packages/openreel-adapter"],
    edlObjects: ["visualGraph", "shotBlocks", "fxBadges"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "advanced-editor-mapping",
    label: "Full Advanced Editor Timeline Mapping",
    priority: "v-beta-1",
    engines: ["node", "browser", "editor"],
    folderTargets: ["packages/openreel-adapter", "apps/web/src/editor"],
    edlObjects: ["tracks", "clips", "effects", "masks", "text"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "semantic-transcript-trimming",
    label: "Semantic Transcript Trimming",
    priority: "v-beta-1 partial",
    engines: ["python-ai", "node"],
    folderTargets: ["workers/python-ai/transcribe", "packages/job-contracts", "packages/edl"],
    edlObjects: ["transcriptLane", "wordTimings", "textDeleteCuts"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "auto-reframe",
    label: "Auto-Reframe Pipeline",
    priority: "v-beta-1",
    engines: ["python-ai", "node", "render"],
    folderTargets: ["workers/python-ai/track_subject", "packages/render-adapters/ffmpeg", "packages/edl"],
    edlObjects: ["transform.crop", "motionTracks[]"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "beat-synced-cuts",
    label: "Beat-Synced Cuts",
    priority: "v-beta-1",
    engines: ["python-audio", "node"],
    folderTargets: ["workers/python-audio/analyze", "packages/edl-enhancers", "packages/edl"],
    edlObjects: ["beatLock", "beatMarkers", "cutAnchors"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "dual-input-energy-curve",
    label: "Dual-Input Energy Curve",
    priority: "v-beta-1",
    engines: ["python-audio", "node"],
    folderTargets: ["workers/python-audio/analyze", "packages/feature-registry", "packages/edl"],
    edlObjects: ["energyCurve", "energyLane"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "music-sync-waveform",
    label: "Music Sync + Waveform Beat Grid",
    priority: "v-beta-1",
    engines: ["python-audio", "browser"],
    folderTargets: ["workers/python-audio", "apps/web/src/components/audio"],
    edlObjects: ["waveform", "beatGrid"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "j-cuts-l-cuts",
    label: "Intelligent J-Cuts / L-Cuts",
    priority: "v-beta-1 partial",
    engines: ["node", "render"],
    folderTargets: ["packages/render-adapters/editly", "packages/edl"],
    edlObjects: ["audioOverlapHandles", "audioOffsets"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "auto-push-in",
    label: "Auto Push-In Motion",
    priority: "v-beta-1",
    engines: ["node"],
    folderTargets: ["packages/edl-enhancers/motion", "packages/openreel-adapter"],
    edlObjects: ["transform.scale"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "speed-ramp-lite",
    label: "Speed Ramp Lite",
    priority: "v-beta-1",
    engines: ["node", "render"],
    folderTargets: ["packages/render-adapters/ffmpeg/speed-ramp"],
    edlObjects: ["timing.speedRamp", "velocityLane"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "impact-camera-shake",
    label: "Impact Camera Shake",
    priority: "v-beta-1",
    engines: ["node", "render"],
    folderTargets: ["packages/edl-enhancers/effects", "packages/render-adapters/ffmpeg"],
    edlObjects: ["context_shake"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "impact-flash",
    label: "Impact Flash Engine",
    priority: "v-beta-1",
    engines: ["node", "render"],
    folderTargets: ["packages/edl-enhancers/effects", "packages/render-adapters/ffmpeg/effects"],
    edlObjects: ["impact_flash"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "text-behind-subject",
    label: "Text Behind Subject Hero Mask",
    priority: "v-beta-1",
    engines: ["python-ai", "node", "render"],
    folderTargets: ["workers/python-ai/masks/sam2", "packages/edl", "packages/render-adapters/ffmpeg/composite"],
    edlObjects: ["masks[]", "textOverlays[]", "layerOrder"],
    enabledByDefault: false,
    requiresGpu: true,
    renderCritical: true
  },
  {
    id: "face-subject-tracking-crop",
    label: "One-Click Face/Subject Tracking Crop",
    priority: "v-beta-1",
    engines: ["python-ai", "node"],
    folderTargets: ["workers/python-ai/track_subject", "packages/edl"],
    edlObjects: ["motionTracks[]", "cropEditor"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "no-ugly-text",
    label: "No Ugly Text Default",
    priority: "v-beta-1",
    engines: ["node", "editor"],
    folderTargets: ["packages/design-tokens", "packages/edl-enhancers/text"],
    edlObjects: ["textStyleDefaults"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: false
  },
  {
    id: "kinetic-captions",
    label: "Kinetic Caption Preset Engine",
    priority: "v-beta-1 partial",
    engines: ["node", "render"],
    folderTargets: ["packages/presets/captions", "packages/render-adapters/motion-canvas"],
    edlObjects: ["captionPresetControls", "caption_pop"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "dynamic-sfx-injection",
    label: "Dynamic SFX Auto-Injection",
    priority: "v-beta-1",
    engines: ["node", "render"],
    folderTargets: ["assets/sfx-library", "packages/edl-enhancers/sfx", "packages/render-adapters/ffmpeg/audio"],
    edlObjects: ["sfxTrack", "sfx_hit"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "reference-color-grading",
    label: "Reference Color Grading",
    priority: "v-beta-1 partial",
    engines: ["python-ai", "render"],
    folderTargets: ["workers/python-ai/color", "packages/render-adapters/ffmpeg/color"],
    edlObjects: ["color_grade"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "preset-export-matrix",
    label: "Preset Export Matrix",
    priority: "v-beta-1",
    engines: ["node", "render"],
    folderTargets: ["packages/render-adapters/export-presets"],
    edlObjects: ["exportButtons", "deliveryPresets"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "instant-aspect-transposition",
    label: "Instant Aspect Ratio Transposition",
    priority: "v-beta-1",
    engines: ["python-ai", "node", "editor"],
    folderTargets: ["packages/edl-enhancers/aspect", "apps/web/src/editor/aspect"],
    edlObjects: ["aspectVariants", "cropKeyframes"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "bezier-velocity-mapping",
    label: "Automated Bezier Velocity Mapping",
    priority: "v-beta-1 partial",
    engines: ["node", "render"],
    folderTargets: ["packages/edl-enhancers/velocity", "packages/render-adapters/ffmpeg/speed-ramp"],
    edlObjects: ["velocityLane", "speed_ramp"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "transient-driven-anchoring",
    label: "Transient-Driven Timeline Anchoring",
    priority: "v-beta-1",
    engines: ["python-audio", "node"],
    folderTargets: ["workers/python-audio/analyze", "packages/job-contracts", "packages/edl"],
    edlObjects: ["transientRuler", "cutAnchors"],
    enabledByDefault: true,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "z-depth-text-placement",
    label: "Z-Depth Text Placement",
    priority: "v-beta-2",
    engines: ["python-ai", "render"],
    folderTargets: ["workers/python-ai/depth", "workers/python-ai/masks", "packages/render-adapters"],
    edlObjects: ["depth_occlusion", "textLayer"],
    enabledByDefault: false,
    requiresGpu: true,
    renderCritical: true
  },
  {
    id: "planar-text",
    label: "Planar Text On Wall/Court",
    priority: "v-beta-1 partial",
    engines: ["python-ai", "editor"],
    folderTargets: ["workers/python-ai/planar", "apps/web/src/editor/planar"],
    edlObjects: ["planar_text", "cornerHandles"],
    enabledByDefault: false,
    requiresGpu: false,
    renderCritical: true
  },
  {
    id: "neon-edge-aura",
    label: "Neon Edge Glow / Aura",
    priority: "v-beta-1 partial",
    engines: ["python-ai", "render"],
    folderTargets: ["workers/python-ai/masks", "packages/render-adapters/ffmpeg/effects"],
    edlObjects: ["aura_glow"],
    enabledByDefault: false,
    requiresGpu: true,
    renderCritical: true
  }
];

export function getEnabledFeatureIds(): string[] {
  return MONET_FEATURES
    .filter((feature) => feature.enabledByDefault)
    .map((feature) => feature.id);
}

export function getFeatureById(id: string): MonetFeature | null {
  const featureMap = new Map<string, MonetFeature>();

  for (const feature of MONET_FEATURES) {
    featureMap.set(feature.id, feature);
  }

  return featureMap.get(id) ?? null;
}