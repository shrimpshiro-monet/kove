import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { SimpleEditorPreview } from "../components/SimpleEditorPreview";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Upload, Play, Pause, RefreshCw, Layers, ArrowLeft, Sparkles, Terminal } from "lucide-react";
import type { MonetEDL } from "../server/types/edl";
import { useEffectsLogger } from "../hooks/use-effects-logger";
import { EffectsLogViewer } from "../components/EffectsLogViewer";

// @ts-ignore - Route tree generation pending
export const Route = createFileRoute("/pure-effects")({
  component: PureEffectsPage,
});

interface EffectConfig {
  type: string;
  name: string;
  intensity: number;
  params?: Record<string, any>;
}

const SUPPORTED_EFFECTS = [
  { type: "rgb_split", name: "RGB Split", defaultIntensity: 0.4 },
  { type: "shake", name: "Camera Shake", defaultIntensity: 0.5 },
  { type: "zoom_pulse", name: "Zoom Pulse", defaultIntensity: 0.4 },
  { type: "glow", name: "Glow", defaultIntensity: 0.5 },
  { type: "invert", name: "Invert", defaultIntensity: 1.0, defaultParams: { blend: 0 } },
  { type: "gaussian-blur", name: "Gaussian Blur", defaultIntensity: 0.5, defaultParams: { blurriness: 15 } },
  { type: "camera-blur", name: "Camera Blur", defaultIntensity: 0.4, defaultParams: { blurRadius: 10 } },
  { type: "brightness", name: "Brightness", defaultIntensity: 0.8 },
  { type: "contrast", name: "Contrast", defaultIntensity: 0.7 },
  { type: "saturation", name: "Saturation", defaultIntensity: 0.8 },
  { type: "mirror", name: "Mirror Frame", defaultIntensity: 1.0, defaultParams: { reflectionAngle: 90 } },
  { type: "mosaic", name: "Retro Mosaic", defaultIntensity: 0.5, defaultParams: { horizontalBlocks: 20, verticalBlocks: 20 } },
  { type: "find_edges", name: "Find Edges", defaultIntensity: 1.0 },
  { type: "posterize", name: "Posterize style", defaultIntensity: 1.0 },
  { type: "strobe_light", name: "Strobe Light", defaultIntensity: 0.5, defaultParams: { period: 0.5, duration: 0.1, strobeType: 1 } },
  { type: "directional_blur", name: "Directional Blur", defaultIntensity: 0.5, defaultParams: { direction: 90, blurLength: 15 } },
  { type: "radial_zoom_blur", name: "Radial Zoom Blur", defaultIntensity: 0.5 },
  { type: "echo", name: "Trailing Echo", defaultIntensity: 0.6, defaultParams: { decay: 0.5 } },
];

function PureEffectsPage() {
  const { logs, log, clearLogs } = useEffectsLogger();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoMeta, setVideoMetadata] = useState<{ duration: number; width: number; height: number }>({
    duration: 10,
    width: 1280,
    height: 720,
  });

  const [activeEffects, setActiveEffects] = useState<EffectConfig[]>([]);
  const [selectedEffectToAdd, setSelectedEffectToAdd] = useState<string>("rgb_split");
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  // Handle local video loading to test offline/without backend records
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      log("unnecessary", "File selection cancelled");
      return;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    log("success", `Video loaded: ${file.name}`, `Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    // Get video duration/dimensions using a temporary video element
    const tempVideo = document.createElement("video");
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoMetadata({
        duration: tempVideo.duration || 10,
        width: tempVideo.videoWidth || 1280,
        height: tempVideo.videoHeight || 720,
      });
      log("success", "Metadata extracted", `Duration: ${tempVideo.duration.toFixed(2)}s, Resolution: ${tempVideo.videoWidth}x${tempVideo.videoHeight}`);
    };
    tempVideo.onerror = () => {
      log("critical", "Failed to load video metadata", `URL: ${url}`);
    };
  };

  const addEffect = () => {
    const template = SUPPORTED_EFFECTS.find((fx) => fx.type === selectedEffectToAdd);
    if (!template) {
      log("warning", `Unknown effect type: ${selectedEffectToAdd}`);
      return;
    }

    // Check if already active
    if (activeEffects.some((fx) => fx.type === template.type)) {
      log("unnecessary", `Effect already active: ${template.name}`);
      return;
    }

    log("success", `Effect added: ${template.name}`, JSON.stringify(template.defaultParams || { intensity: template.defaultIntensity }));
    setActiveEffects([
      ...activeEffects,
      {
        type: template.type,
        name: template.name,
        intensity: template.defaultIntensity,
        params: template.defaultParams ? { ...template.defaultParams } : undefined,
      },
    ]);
  };

  const applyChaosMode = () => {
    log("warning", "Chaos Mode activated: randomizing pipeline");
    // Select 4 random effects
    const shuffled = [...SUPPORTED_EFFECTS].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 4);
    
    log("success", `Chaos applied ${selected.length} effects`, selected.map(s => s.name).join(", "));
    setActiveEffects(selected.map(fx => ({
      type: fx.type,
      name: fx.name,
      intensity: fx.defaultIntensity,
      params: fx.defaultParams ? { ...fx.defaultParams } : undefined,
    })));
  };

  const resetAllEffects = () => {
    log("unnecessary", "Reset all effects: timeline cleared");
    setActiveEffects([]);
  };

  const removeEffect = (type: string) => {
    const fx = activeEffects.find(f => f.type === type);
    log("unnecessary", `Effect removed: ${fx?.name || type}`);
    setActiveEffects(activeEffects.filter((fx) => fx.type !== type));
  };

  const updateIntensity = (type: string, val: number) => {
    setActiveEffects(
      activeEffects.map((fx) => {
        if (fx.type !== type) return fx;
        
        // Handle specific scale mappings if needed
        const updated = { ...fx, intensity: val };
        
        // Synced helper params based on intensity
        if (fx.type === "gaussian-blur" && fx.params) {
          updated.params = { ...fx.params, blurriness: Math.round(val * 30) };
        } else if (fx.type === "camera-blur" && fx.params) {
          updated.params = { ...fx.params, blurRadius: Math.round(val * 25) };
        } else if (fx.type === "directional_blur" && fx.params) {
          updated.params = { ...fx.params, blurLength: Math.round(val * 30) };
        } else if (fx.type === "echo" && fx.params) {
          updated.params = { ...fx.params, decay: val * 0.9 };
        }
        
        return updated;
      })
    );
  };

  const updateParam = (type: string, key: string, val: any) => {
    setActiveEffects(
      activeEffects.map((fx) => {
        if (fx.type !== type) return fx;
        return {
          ...fx,
          params: {
            ...(fx.params || {}),
            [key]: val,
          },
        };
      })
    );
  };

  // Build the MonetEDL containing our single clip and the selected effects list
  const edl = useMemo<MonetEDL>(() => {
    const clipId = videoFile ? `dev-${videoFile.name}` : "sample-footage";
    
    // map our effect config format to the EDL format
    const mappedEffects = activeEffects.map((fx) => ({
      id: fx.type,
      type: fx.type,
      intensity: fx.intensity,
      params: fx.params,
      // Play throughout the whole shot
      startTime: 0,
      duration: videoMeta.duration,
    }));

    return {
      version: "1.0.0",
      metadata: {
        title: "Pure Effects Tester",
        createdAt: Date.now(),
        aiModel: "Manual-Test",
        prompt: "testing pure effects rendering",
        intentId: "test-intent",
        analysisId: "test-analysis",
      },
      timeline: {
        resolution: { width: videoMeta.width, height: videoMeta.height },
        fps: 30,
        duration: videoMeta.duration,
      },
      shots: [
        {
          id: "test-shot-1",
          source: {
            clipId: clipId,
            inPoint: 0,
            outPoint: videoMeta.duration,
          },
          timing: {
            startTime: 0,
            duration: videoMeta.duration,
          },
          effects: mappedEffects as any,
        },
      ],
    };
  }, [videoFile, videoMeta, activeEffects]);

  const mediaUrls = useMemo(() => {
    const clipId = videoFile ? `dev-${videoFile.name}` : "sample-footage";
    const mapped: Record<string, string> = {};
    
    if (videoUrl) {
      mapped[clipId] = videoUrl;
      mapped[`${clipId}_proxy`] = videoUrl; // Support preview fallbacks
    } else {
      // Default placeholder video
      const defaultSample = "https://vjs.zencdn.net/v/oceans.mp4";
      mapped["sample-footage"] = defaultSample;
      mapped["sample-footage_proxy"] = defaultSample;
    }
    
    return mapped;
  }, [videoFile, videoUrl]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-serif">Pure Effects Testing Page</h1>
              <p className="text-sm text-muted-foreground">
                Apply pre-defined visual effects to verify that the canvas rendering engine is functioning perfectly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
              VFX Sandbox
            </span>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls & Canvas Preview */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-border bg-card overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Canvas Output</CardTitle>
                  <CardDescription className="text-xs">
                    {videoFile ? `Testing file: ${videoFile.name}` : "Using fallback BigBuckBunny sample video"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {currentTime.toFixed(1)}s / {videoMeta.duration.toFixed(1)}s
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 bg-[#0a0a0a] flex items-center justify-center min-h-[300px]">
                <div className="w-full max-w-2xl relative">
                  <SimpleEditorPreview
                    edl={edl}
                    mediaUrls={mediaUrls}
                    currentTime={currentTime}
                    playing={playing}
                    className="w-full aspect-video border border-border/40 rounded-lg shadow-xl"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Video File Loader */}
            <Card className="border-border bg-card">
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm font-medium">1. Add Your Video</CardTitle>
                <CardDescription className="text-xs">
                  Select a local raw video file from your computer. No backend uploads are required for this sandbox page.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-6 cursor-pointer bg-card/40 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm font-medium">Click to select video</span>
                    <span className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM (Max 100MB)</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {videoFile && (
                    <div className="text-sm space-y-1 bg-muted/40 p-4 rounded-lg border border-border w-1/3">
                      <p className="font-semibold truncate">{videoFile.name}</p>
                      <p className="text-xs text-muted-foreground">Size: {(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      <p className="text-xs text-muted-foreground">Duration: {videoMeta.duration.toFixed(1)}s</p>
                      <p className="text-xs text-muted-foreground">Resolution: {videoMeta.width}x{videoMeta.height}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Effects Configuration Panel */}
          <div className="space-y-4">
            <Card className="border-border bg-card flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
              <CardHeader className="py-3 px-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">2. Effects Inspector</CardTitle>
                  <div className="flex gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={applyChaosMode}
                      className="h-7 px-2 text-[10px] flex items-center gap-1 bg-primary/5 border-primary/20 hover:bg-primary/10"
                    >
                      <Sparkles className="h-3 w-3" />
                      Chaos
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={resetAllEffects}
                      className="h-7 px-2 text-[10px] flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Select an effect and click Add to apply it. Configure the intensity/parameters below.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
                {/* Select Effect Dropdown */}
                <div className="flex gap-2">
                  <Select value={selectedEffectToAdd} onValueChange={setSelectedEffectToAdd}>
                    <SelectTrigger className="flex-1 text-sm">
                      <SelectValue placeholder="Choose Effect" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_EFFECTS.map((fx) => (
                        <SelectItem key={fx.type} value={fx.type}>
                          {fx.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={addEffect}>
                    Add Effect
                  </Button>
                </div>

                {/* Active Effects List */}
                <div className="flex-1 space-y-4 pr-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-1">
                    <Layers className="h-3.5 w-3.5" />
                    Active Effects ({activeEffects.length})
                  </div>

                  {activeEffects.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
                      No effects active.<br />Add an effect above to begin testing.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeEffects.map((fx) => (
                        <div
                          key={fx.type}
                          className="p-3 bg-muted/40 rounded-lg border border-border/80 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{fx.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEffect(fx.type)}
                              className="text-xs text-destructive hover:text-destructive/80 h-7 px-2 hover:bg-destructive/10"
                            >
                              Remove
                            </Button>
                          </div>

                          {/* Intensity slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Intensity</span>
                              <span className="font-mono font-medium">{fx.intensity.toFixed(2)}</span>
                            </div>
                            <Slider
                              value={[fx.intensity]}
                              min={0}
                              max={fx.type === "saturation" ? 2 : 1}
                              step={0.05}
                              onValueChange={([v]) => updateIntensity(fx.type, v)}
                              className="py-1"
                            />
                          </div>

                          {/* Custom Parameters based on effect type */}
                          {fx.type === "invert" && fx.params && (
                            <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded border border-border/40 text-xs">
                              <span className="text-muted-foreground flex items-center">Invert Blend:</span>
                              <input
                                type="number"
                                value={fx.params.blend}
                                min={0}
                                max={100}
                                onChange={(e) => updateParam(fx.type, "blend", Number(e.target.value))}
                                className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                              />
                            </div>
                          )}

                          {fx.type === "mirror" && fx.params && (
                            <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded border border-border/40 text-xs">
                              <span className="text-muted-foreground flex items-center">Reflection Angle:</span>
                              <Select
                                value={String(fx.params.reflectionAngle)}
                                onValueChange={(val) => updateParam(fx.type, "reflectionAngle", Number(val))}
                              >
                                <SelectTrigger className="h-6 text-xs py-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="90">90° (Vertical)</SelectItem>
                                  <SelectItem value="180">180° (Horizontal)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {fx.type === "mosaic" && fx.params && (
                            <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded border border-border/40 text-xs">
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-[10px]">H-Blocks</span>
                                <input
                                  type="number"
                                  value={fx.params.horizontalBlocks}
                                  min={2}
                                  max={200}
                                  onChange={(e) => updateParam(fx.type, "horizontalBlocks", Number(e.target.value))}
                                  className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-[10px]">V-Blocks</span>
                                <input
                                  type="number"
                                  value={fx.params.verticalBlocks}
                                  min={2}
                                  max={200}
                                  onChange={(e) => updateParam(fx.type, "verticalBlocks", Number(e.target.value))}
                                  className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                                />
                              </div>
                            </div>
                          )}

                          {fx.type === "directional_blur" && fx.params && (
                            <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded border border-border/40 text-xs">
                              <span className="text-muted-foreground flex items-center">Angle:</span>
                              <input
                                type="number"
                                value={fx.params.direction}
                                min={0}
                                max={360}
                                onChange={(e) => updateParam(fx.type, "direction", Number(e.target.value))}
                                className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                              />
                            </div>
                          )}

                          {fx.type === "strobe_light" && fx.params && (
                            <div className="grid grid-cols-2 gap-2 bg-background/50 p-2 rounded border border-border/40 text-xs">
                              <div className="space-y-1 col-span-2 flex justify-between gap-1 items-center">
                                <span className="text-muted-foreground">Type:</span>
                                <Select
                                  value={String(fx.params.strobeType)}
                                  onValueChange={(val) => updateParam(fx.type, "strobeType", Number(val))}
                                >
                                  <SelectTrigger className="h-6 text-xs py-0 w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">Blackout</SelectItem>
                                    <SelectItem value="1">Color Invert</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-[10px]">Period (s)</span>
                                <input
                                  type="number"
                                  value={fx.params.period}
                                  step={0.1}
                                  onChange={(e) => updateParam(fx.type, "period", Number(e.target.value))}
                                  className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-[10px]">Dur (s)</span>
                                <input
                                  type="number"
                                  value={fx.params.duration}
                                  step={0.05}
                                  onChange={(e) => updateParam(fx.type, "duration", Number(e.target.value))}
                                  className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-center"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <EffectsLogViewer 
              logs={logs} 
              onClear={clearLogs} 
              className="flex-1 min-h-[250px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
