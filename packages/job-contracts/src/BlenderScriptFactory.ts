export interface HighlightSegment {
  name: string;
  sourceStartSecond: number;
  durationSeconds: number;
  applySpeedRamp: boolean;
  rampTriggerOffsetSecond?: number; // Offset from segment start
}

export interface AudioTrack {
  filePath: string;
  channel: number;
  volume: number;
}

export interface BlenderProjectConfig {
  sourceVideoPath: string;
  outputPath: string;
  resolutionX?: number;
  resolutionY?: number;
  fps?: number;
  segments: HighlightSegment[];
  audio?: AudioTrack[];
}

export class BlenderScriptFactory {
  public static generateHeadlessScript(config: BlenderProjectConfig): string {
    const resX = config.resolutionX ?? 1080;
    const resY = config.resolutionY ?? 1920; // Defaulting to vertical 9:16 short-form
    const fps = config.fps ?? 60;

    let segmentsPyArray = 'HIGHLIGHTS = [\n';
    config.segments.forEach((seg) => {
      segmentsPyArray += `    {
        "name": "${seg.name}",
        "offset_start": ${Math.floor(seg.sourceStartSecond * fps)},
        "duration": ${Math.floor(seg.durationSeconds * fps)},
        "speed_ramp": ${seg.applySpeedRamp ? 'True' : 'False'},
        "ramp_trigger": ${seg.rampTriggerOffsetSecond ? Math.floor(seg.rampTriggerOffsetSecond * fps) : 0}
    },\n`;
    });
    segmentsPyArray += ']';

    let audioPyArray = 'AUDIO_TRACKS = [\n';
    if (config.audio) {
      config.audio.forEach((aud) => {
        audioPyArray += `    {"path": "${aud.filePath.replace(/\\/g, '/')}", "channel": ${aud.channel}, "volume": ${aud.volume}},\n`;
      });
    }
    audioPyArray += ']';

    return `import bpy
import os

SOURCE_VIDEO_PATH = "${config.sourceVideoPath.replace(/\\/g, '/')}"
OUTPUT_PATH = "${config.outputPath.replace(/\\/g, '/')}"
RESOLUTION_X = ${resX}
RESOLUTION_Y = ${resY}
FPS = ${fps}

${segmentsPyArray}
${audioPyArray}

def init_blender_pipeline():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.fps = FPS
    
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'HIGH'
    scene.render.filepath = OUTPUT_PATH

    scene.sequence_editor_create()
    scene.render.use_sequencer = True
    scene.use_nodes = True
    print("[Engine] Initialization successful.")

def construct_timeline():
    seq = bpy.context.scene.sequence_editor
    current_timeline_frame = 1
    video_channel = 1

    # Safe verification loop for disk resources
    if not os.path.exists(SOURCE_VIDEO_PATH):
        raise FileNotFoundError(f"Source video completely missing from system virtualization layer: {SOURCE_VIDEO_PATH}")

    for idx, seg in enumerate(HIGHLIGHTS):
        print(f"[Engine] Cutting segment '{seg['name']}' at timeline frame {current_timeline_frame}")
        
        # Instantiate movie strip using single source master target file
        strip = seq.sequences.new_movie(
            name=seg['name'],
            filepath=SOURCE_VIDEO_PATH,
            channel=video_channel,
            frame_start=current_timeline_frame
        )
        
        # Slicing the clip down safely via key animation frame offsets
        strip.animation_offset_start = seg['offset_start']
        strip.frame_final_duration = seg['duration']
        
        # Apply velocity mapping programmatic ramps safely
        if seg['speed_ramp']:
            speed_strip = seq.sequences.new_effect(
                name=f"Ramp_{idx}",
                type='SPEED',
                channel=video_channel + 1,
                frame_start=current_timeline_frame,
                frame_end=current_timeline_frame + seg['duration'],
                seq1=strip
            )
            speed_strip.use_homogeneous_speed = False
            
            # Anchor curves safely relative to internal event frames
            trigger = current_timeline_frame + seg['ramp_trigger']
            
            speed_strip.speed_factor = 1.0
            speed_strip.keyframe_insert(data_path="speed_factor", frame=trigger - 15)
            speed_strip.speed_factor = 0.20  # Extreme slow impact slam
            speed_strip.keyframe_insert(data_path="speed_factor", frame=trigger)
            speed_strip.speed_factor = 2.5   # Hyper-acceleration recovery
            speed_strip.keyframe_insert(data_path="speed_factor", frame=trigger + 20)
            speed_strip.speed_factor = 1.0
            speed_strip.keyframe_insert(data_path="speed_factor", frame=trigger + 35)

        current_timeline_frame += seg['duration']

    # Inject Background Audios/SFX layers safely
    for aud in AUDIO_TRACKS:
        if os.path.exists(aud['path']):
            aud_strip = seq.sequences.new_sound(
                name=os.path.basename(aud['path']),
                filepath=aud['path'],
                channel=aud['channel'],
                frame_start=1
            )
            aud_strip.volume = aud['volume']

    bpy.context.scene.frame_end = current_timeline_frame - 1
    print("[Engine] Timeline constructed successfully.")

def build_compositor_nodes():
    scene = bpy.context.scene
    tree = scene.node_tree
    tree.nodes.clear()
    
    # Use Scene node to pull from the Sequencer
    # Note: Ensure scene.render.use_sequencer is True for this to work
    node_input = tree.nodes.new('CompositorNodeRLayers')
    node_input.scene = scene
    node_input.location = (-300, 0)
    
    # Fast algorithmic contrast filter configuration
    bright_contrast = tree.nodes.new('CompositorNodeBrightContrast')
    bright_contrast.location = (0, 0)
    bright_contrast.inputs['Contrast'].default_value = 2.2
    bright_contrast.inputs['Brightness'].default_value = 0.2
    
    # Dynamic glow composition node map
    blur_node = tree.nodes.new('CompositorNodeBlur')
    blur_node.location = (200, 150)
    blur_node.size_x = 25
    blur_node.size_y = 25
    
    mix_node = tree.nodes.new('CompositorNodeMixRGB')
    mix_node.location = (450, 0)
    mix_node.blend_type = 'ADD'
    mix_node.inputs['Fac'].default_value = 0.35
    
    comp_node = tree.nodes.new('CompositorNodeComposite')
    comp_node.location = (700, 0)
    
    # Establish direct pipe connections
    tree.links.new(node_input.outputs['Image'], bright_contrast.inputs['Image'])
    tree.links.new(bright_contrast.outputs['Image'], blur_node.inputs['Image'])
    tree.links.new(bright_contrast.outputs['Image'], mix_node.inputs[1])
    tree.links.new(blur_node.outputs['Image'], mix_node.inputs[2])
    tree.links.new(mix_node.outputs['Image'], comp_node.inputs['Image'])
    print("[Engine] Compositor network built successfully.")

if __name__ == "__main__":
    try:
        init_blender_pipeline()
        construct_timeline()
        build_compositor_nodes()
        print("[Engine] Starting server render compilation...")
        bpy.ops.render.render(animation=True)
        print("[Engine] Complete execution block ran with zero errors.")
    except Exception as e:
        import sys
        print(f"[FATAL SERVER EXCEPTION]: {str(e)}", file=sys.stderr)
        sys.exit(1)
`;
  }
}
