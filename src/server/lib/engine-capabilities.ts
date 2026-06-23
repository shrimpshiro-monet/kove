// src/server/lib/engine-capabilities.ts
// Multi-Engine Editing Capability Contract & License Rules for Monet AI Director (Gemini)

export interface EngineCapability {
  id: string;
  name: string;
  license: string;
  commercialStatus: string;
  deliveryStrategy: string;
  description: string;
  contract: string;
}

export function getEngineCapabilityContract(engineId: string): string {
  switch (engineId) {
    case "freecut":
      return `
## FreeCut (MIT) Professional Browser NLE Contract (RECOMMENDED BASE)
**Strategy**: Zero-Restrictions Permissive. Use as the primary browser-based video editor. Every edit compiles into a serializable Action Object, making it perfect for LLM-directed automation.

### Directives & Action Sequence API:
1. **Core Action Object Structure**: Every edit must correspond to an Action Object of standard schema:
   - \`{"type": "cut" | "split" | "applyFilter" | "addCaption" | "addTransition" | "updateKeyframe", "trackId": string, ...}\`
2. **WebGPU Shader Effects**: Apply advanced browser effects (Gaussian blur, chromatic aberration, twirl, fluted glass, vignettes, color glitches).
3. **Keyframe Animations**: Output Bezier curve keyframes and dopesheet specifications for scale, transform, and rotation.
4. **Local Audio Handling**: Direct audio faders, pitch shifts, volume fades, and 6-band floating EQ panels.
5. **AI Subsystems (Whisper + Kokoro)**: Integrate automatic Whisper local transcription for subtitles, and local Kokoro TTS for voice generation.
`;

    case "kubeezcut":
      return `
## KubeezCut (MIT) AI-First Video Engine Contract
**Strategy**: Permissive. Built on FreeCut + OpenCut. Specialized in AI-assisted video workflows.

### Directives:
1. **React 19 Rendering**: Optimized for React 19 concurrent rendering and WebGPU performance.
2. **Hybrid Workflows**: Direct the engine to organize and sequence media assets into the NLE timeline using the specific IDs provided.
3. **Advanced Shader Transitions**: Use KubeezCut's specialized WebGPU transitions (liquid, blur-wipe, chromatic-fade).
`;

    case "opencut":
      return `
## OpenCut (MIT) Open-Source CapCut Alternative Contract
**Strategy**: Permissive. Modern rewrite focusing on an Editor API and MCP server for AI agents.

### Directives:
1. **MCP Server Integration**: Use Model Context Protocol (MCP) to communicate between AI agents and the editor.
2. **Headless Execution**: Direct the engine in headless mode for server-side automated editing.
3. **Plugin System**: Leverage the plugin architecture for custom effects and specialized AI toolsets.
`;

    case "omniclip":
      return `
## OmniClip (MIT) Hackable Web Editor Contract
**Strategy**: Permissive. Lightweight TypeScript-based web video editor using @benev/slate.

### Directives:
1. **Slate Integration**: Use the slate-based state management for managing media assets and timeline state.
2. **Lightweight Splicing**: Ideal for fast, browser-based clip splicing and basic overlays.
`;

    case "ffmpeg":
      return `
## FFmpeg (LGPL-2.1) Backend Powerhouse Contract
**Strategy**: LGPL Compliance. Industry-standard for transcoding, filtering, and complex render chains.

### Directives:
1. **Complex Filtergraphs**: Generate complex -filter_complex strings for multi-layer compositing, overlays, and advanced color grading.
2. **Transcoding & Codec Optimization**: Select optimal codecs (AV1, VP9, H.264) and bitrates for specific delivery targets.
3. **High-Performance Export**: Direct the final rendering and encoding of edited projects into MP4/WebM/MOV containers.
`;

    case "mlt-framework":
      return `
## MLT Framework (LGPL-2.1-or-later) Editing Contract
**Strategy**: Hybrid Permissiveness. Dynamically link to MLT as the server-side compositing backend. UI and AI effects layers stay 100% proprietary.

### Directives:
1. **Compositing**: Use MLT's core multi-track mixing engine to compile composite shots (Shot overlays, watermarks, PIP).
2. **Standard Transitions**: Output standard MLT transitions (crossfade, wipe, slide) mapped as shot.transition.type.
3. **XML/EDL Generation**: Produce clean, normalized timeline metadata conforming to MLT XML-like structures.
4. **Relinking Safe**: Ensure that timeline structures permit dynamic rebuilding/recompiling on custom media sources.
`;

    case "moviepy":
      return `
## MoviePy (MIT) Python-SaaS Editing Contract
**Strategy**: Permissive. Run as serverless background workers for quick automation, splicing, and programmatic scripting.

### Directives:
1. **Splicing & Slicing**: Use for programmatic video cuts, trims, and concat actions.
2. **Audio Syncing**: Programmatically link separate audio tracks, music tracks, and voiceovers.
3. **Python Worker Scripts**: Generate structured Python command lists that invoke MoviePy's VideoFileClip and AudioFileClip modules.
4. **Simple Titles & Fades**: Apply linear fade-ins, fade-outs, and basic static text titles.
`;

    case "openreel-video":
      return `
## OpenReel Video (MIT) High-End Autonomous Editing Contract
**Strategy**: Pure permissive play. Complete freedom to fork, customize, add proprietary features, and bundle client/server with zero risk.

### Directives:
1. **Motion Tracking**: Emit motionTracks[] (method: feature | face | object) with keyframes (x, y, scale, rotation) to track subjects.
2. **Planar Surface Tracking**: Emit planarTracks[] with normalized coordinates to pin typography or overlays to flat environments (walls, screens).
3. **Tracked Overlays**: Use textOverlays[] synced to motionTracks or planarTracks. Set tracking.mode to 'follow', 'behind_subject', or 'planar'.
4. **SAM 2 Isolate & Masking**: Add MaskAsset inside masks[] and reference inside shot.compositing.maskId to create depth-aware layered compositions.
5. **Aesthetic Transform Ramps**: Apply smooth scaled zooms, rotations, and opacity keyframes using 'bezier', 'elastic', or 'bounce' easings.
`;

    case "natron":
    case "shotcut":
    case "kdenlive":
    case "blender":
      const isNatron = engineId === "natron";
      const isBlender = engineId === "blender";
      const isShotcut = engineId === "shotcut";
      return `
## ${engineId.toUpperCase()} (GPL) SaaS-only Render Contract
**Strategy**: Server-only SaaS Loophole. Run headless on secure servers. Never distribute binaries or installers to client devices. Your custom modifications stay private.

### Directives:
1. **No-Client Distribution Rule**: Never compile, expose, or share binaries of these engines to client applications or web browsers.
2. **Advanced Compositing (Natron)**: ${isNatron ? "Use node-based compositing for high-end rotoscoping, chroma keying, and tracking." : isShotcut ? "Direct pro-grade video editing tasks using MLT-based Shotcut engine." : "Direct pro-grade video editing and rendering tasks."}
3. **Advanced 3D/VFX (Blender)**: ${isBlender ? `
   - Use the EEVEE engine selection with EEVEE_NEXT fallback:
     try:
         bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
     except TypeError:
         bpy.context.scene.render.engine = 'BLENDER_EEVEE'
   - Use 'bpy.context.scene.render.filepath = "OUTPUT_PATH"' for the output path.
   - For Video Editing (Sequencer): Use 'bpy.context.scene.sequence_editor_create()' and set 'bpy.context.scene.render.use_sequencer = True'.
   - For VFX (Compositor): Use 'bpy.context.scene.use_nodes = True' and load video via 'CompositorNodeMovieClip'.
   - IMPORTANT: To render VSE output THROUGH the Compositor, you must add a 'CompositorNodeRLayers' node and enable 'Sequencer' in the scene's Post Processing settings.
` : "Direct the engine to perform complex server-side render tasks."}
4. **Headless Control**: Generate headless scripts (Python for Blender, XML for Shotcut/Kdenlive) to execute complex rendering pipelines server-side.
`;

    default:
      return "Unknown engine capability request.";
  }
}

export function getAllEngineCapabilities(): EngineCapability[] {
  return [
    {
      id: "freecut",
      name: "FreeCut",
      license: "MIT",
      commercialStatus: "Fully Permissive & Highly Recommended Base",
      deliveryStrategy: "Fork, rebrand, and sell as proprietary with zero legal restrictions. Bundled client-side.",
      description: "Fully client-side browser video editor built on WebGPU + WebCodecs with an action-based serializable core.",
      contract: getEngineCapabilityContract("freecut"),
    },
    {
      id: "kubeezcut",
      name: "KubeezCut",
      license: "MIT",
      commercialStatus: "Fully Permissive",
      deliveryStrategy: "Build on top of FreeCut + OpenCut. Specialized in AI media generation.",
      description: "AI-first fork of FreeCut with specialized AI-assisted video workflows.",
      contract: getEngineCapabilityContract("kubeezcut"),
    },
    {
      id: "opencut",
      name: "OpenCut",
      license: "MIT",
      commercialStatus: "Fully Permissive",
      deliveryStrategy: "Use the MCP server for AI agent communication. Supports headless mode.",
      description: "The original open-source CapCut alternative, featuring an API-first modern rewrite.",
      contract: getEngineCapabilityContract("opencut"),
    },
    {
      id: "omniclip",
      name: "OmniClip",
      license: "MIT",
      commercialStatus: "Fully Permissive",
      deliveryStrategy: "Lightweight, hackable web editor using TypeScript and @benev/slate.",
      description: "Hackable web video editor using modern TypeScript state management.",
      contract: getEngineCapabilityContract("omniclip"),
    },
    {
      id: "ffmpeg",
      name: "FFmpeg",
      license: "LGPL-2.1-or-later",
      commercialStatus: "Commercially Permissive (LGPL build)",
      deliveryStrategy: "Use as the primary backend render engine for final exports and transcoding.",
      description: "The industry-standard multimedia framework for video processing and encoding.",
      contract: getEngineCapabilityContract("ffmpeg"),
    },
    {
      id: "mlt-framework",
      name: "MLT Framework",
      license: "LGPL-2.1-or-later",
      commercialStatus: "Commercially Permissive via Dynamic Linking",
      deliveryStrategy: "Link dynamically on server. Keep React frontend/AI layers proprietary.",
      description: "Industry-standard C++ multimedia framework. Powering Shotcut and Kdenlive for 10+ years.",
      contract: getEngineCapabilityContract("mlt-framework"),
    },
    {
      id: "openreel-video",
      name: "OpenReel Video",
      license: "MIT",
      commercialStatus: "Fully Permissive",
      deliveryStrategy: "Fork and modify fully. Build custom WebGPU shaders and proprietary feature extensions.",
      description: "Ultra-modern, modular TypeScript-based rendering and video editing engine.",
      contract: getEngineCapabilityContract("openreel-video"),
    },
    {
      id: "moviepy",
      name: "MoviePy",
      license: "MIT",
      commercialStatus: "Fully Permissive",
      deliveryStrategy: "Run as server-side python microservices. Direct with Python script automation.",
      description: "Highly popular Python library for video editing, compositing, and automated rendering.",
      contract: getEngineCapabilityContract("moviepy"),
    },
    {
      id: "kdenlive",
      name: "Kdenlive",
      license: "GPL-3.0",
      commercialStatus: "Permissive for Server-only SaaS (SaaS Loophole)",
      deliveryStrategy: "Execute only on server backend. Never distribute binaries to clients.",
      description: "GPL-licensed pro-grade video editor. Powerful headless rendering backend.",
      contract: getEngineCapabilityContract("kdenlive"),
    },
    {
      id: "shotcut",
      name: "Shotcut",
      license: "GPL-3.0",
      commercialStatus: "Permissive for Server-only SaaS (SaaS Loophole)",
      deliveryStrategy: "Execute only on server backend. Never distribute binaries to clients.",
      description: "GPL-licensed open-source video editor, based on the MLT framework.",
      contract: getEngineCapabilityContract("shotcut"),
    },
    {
      id: "natron",
      name: "Natron",
      license: "GPL-2.0",
      commercialStatus: "Permissive for Server-only SaaS (SaaS Loophole)",
      deliveryStrategy: "Execute only on server backend. Never distribute binaries to clients.",
      description: "Node-based compositor, outstanding for rotoscoping and complex chroma keying.",
      contract: getEngineCapabilityContract("natron"),
    },
    {
      id: "blender",
      name: "Blender",
      license: "GPL-3.0",
      commercialStatus: "Permissive for Server-only SaaS (SaaS Loophole)",
      deliveryStrategy: "Execute only on server backend. Never distribute binaries to clients.",
      description: "World-class 3D creation suite, outstanding for 3D tracking, titles, and motion graphics.",
      contract: getEngineCapabilityContract("blender"),
    },
  ];
}

/**
 * Returns a comprehensive system instruction block to train Gemini (AI Director)
 * on how to output license-compliant, engine-specific edits.
 */
export function getAISystemEditingInstruction(): string {
  return `
You are Monet, an AI Video Director. You direct multi-engine video edits conforming to strict commercial licenses.
The current platform supports several video editing and rendering backends, specializing in the **FreeCut + FFmpeg (LGPL)** production-grade stack. You must design and produce edits tailored to their licenses, delivery models, and technical capabilities:

### CRITICAL RULES
1. **NO ID HALLUCINATION**: You MUST use the exact, literal ID strings provided in the context (e.g., clipIds, sourceId). NEVER invent human-readable placeholders like "CLIP_1" or "BACKGROUND_MUSIC".
2. **NO CAPABILITY HALLUCINATION**: Only use the directives explicitly listed in each engine's contract. If a model or feature is not listed, it DOES NOT exist. Do NOT invent AI model names.

### Engine Profiles
1. **FreeCut (MIT - RECOMMENDED BASE)**: Fully client-side browser video NLE using WebGPU + WebCodecs. It has an action-based serializable core. When editing for FreeCut, output linear, action-based sequences (JSON action logs of cuts, filters, and subtitles) for real-time preview and WebCodecs browser rendering. Use its rich 25+ GPU filters and Bezier keyframes.
2. **OpenReel Video (MIT)**: Permissive, open-source NLE. Excellent for advanced motion tracking, tracked overlays, planar surface tracking, and SAM 2 subject masking. Use these features when the user wants environmental kinetic text.
3. **MLT Framework (LGPL)**: Dynamic-linking backend. Excellent for clean timeline composites and broadcast-grade cuts. Your output will compile to MLT XML or MonetEDL.
4. **MoviePy (MIT)**: Python-based worker. Ideal for rapid background cuts, simple trims, concatenations, audio-track syncing, and quick headless rendering.
5. **Kdenlive & Blender (GPL)**: SaaS Loophole backend. Used strictly server-side for advanced 3D motion graphics or complex headless renders. Never reference any actions that require client-side downloading of GPL code.

### Guidelines for your Output:
- When generating or refining EDLs, you are operating as a professional technical director.
- You must structure the timeline (MonetEDL / Shot list) so it is readily convertible to FreeCut action sequences, MLT XML, OpenReel structures, or MoviePy scripts.
- When FreeCut is targeted, you must outline step-by-step Action Sequences (such as split clip, apply filter, add caption, apply transition) in your shot rationales so the frontend editor can instantly compile and execute them.
- Always include an "aiRationale" on shots to explain why a particular shot, transition, or effect was chosen.
`;
}
