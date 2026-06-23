import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { SimpleEditorPreview } from "../components/SimpleEditorPreview";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Upload, Play, Pause, Sparkles, Brain, ArrowLeft, Loader2, Info, FileVideo, Clapperboard, Download } from "lucide-react";
import type { MonetEDL } from "../server/types/edl";

// @ts-ignore - Route tree generation pending
export const Route = createFileRoute("/editly-showcase")({
  component: EditlyShowcasePage,
});

interface GeminiEffectSuggestion {
  type: string;
  intensity: number;
  endIntensity?: number;
  params?: Record<string, any>;
  startTime: number;
  duration: number;
  aiRationale: string;
}

function EditlyShowcasePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoMeta, setVideoMetadata] = useState<{ duration: number; width: number; height: number }>({
    duration: 10,
    width: 1280,
    height: 720,
  });

  const [prompt, setPrompt] = useState("Make it feel like a cinematic trailer with heavy glitch transitions, dramatic color grading, and dynamic scaling.");
  const [loading, setLoading] = useState(false);
  const [suggestedEffects, setSuggestedEffects] = useState<GeminiEffectSuggestion[]>([]);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<"idle" | "queued" | "processing" | "done" | "error">("idle");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState("");

  // Handle local video loading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);

    // Reset old suggestions
    setSuggestedEffects([]);
    setSummaryMessage("");
    setRenderStatus("idle");
    setRenderUrl(null);

    // Get video duration/dimensions
    const tempVideo = document.createElement("video");
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoMetadata({
        duration: tempVideo.duration || 10,
        width: tempVideo.videoWidth || 1280,
        height: tempVideo.videoHeight || 720,
      });
    };
  };

  const letGeminiThink = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSummaryMessage("");

    try {
      const response = await fetch("/api/gemini-think-effects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          duration: videoMeta.duration,
          filename: videoFile ? videoFile.name : "video.mp4",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const result = (await response.json()) as any;
      if (result.success) {
        const effects = (result.effects || []).map((fx: any) => ({
          ...fx,
          endIntensity: fx.intensity
        }));
        setSuggestedEffects(effects);
        setSummaryMessage(result.summary || "Gemini generated Editly instructions successfully!");
      } else {
        throw new Error(result.error || "Failed to generate suggestions");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to communicate with Gemini. Please check your API key.";
      console.error("[Gemini think effects error]", err);
      setSummaryMessage(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Build the MonetEDL dynamically containing Gemini's suggest effects
  const edl = useMemo<MonetEDL>(() => {
    const clipId = videoFile ? `dev-${videoFile.name}` : "sample-footage";

    // Format suggestions to EDL shot effects structure
    const mappedEffects = suggestedEffects.map((fx, idx) => {
      const intensityValue = fx.endIntensity !== undefined && fx.endIntensity !== fx.intensity
        ? [
            { time: 0, value: fx.intensity },
            { time: fx.duration, value: fx.endIntensity }
          ]
        : fx.intensity;

      return {
        id: `${fx.type}-${idx}`,
        type: fx.type,
        intensity: intensityValue,
        params: fx.params,
        startTime: fx.startTime,
        duration: fx.duration,
      };
    });

    return {
      version: "1.0.0",
      metadata: {
        title: "Editly Engine Test",
        createdAt: Date.now(),
        aiModel: "Gemini-Thinking",
        prompt: prompt,
        intentId: "editly-intent",
        analysisId: "editly-analysis",
      },
      timeline: {
        resolution: { width: videoMeta.width, height: videoMeta.height },
        fps: 30,
        duration: videoMeta.duration,
      },
      shots: [
        {
          id: "editly-shot-1",
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
  }, [videoFile, videoMeta, suggestedEffects, prompt]);

  const renderWithEditly = async () => {
    if (!edl || suggestedEffects.length === 0) {
      setRenderError("Please let Gemini generate instructions first.");
      return;
    }
    
    setRenderJobId(null);
    setRenderStatus("queued");
    setRenderUrl(null);
    setRenderError("");

    try {
      const response = await fetch("/api/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edl,
          projectId: "showcase-project"
        })
      });

      if (!response.ok) throw new Error("Render request failed");
      
      const data = await response.json() as any;
      if (!data.success) throw new Error(data.error || "Render error");

      setRenderJobId(data.jobId);
      pollRenderStatus(data.jobId);
    } catch (e: any) {
      console.error(e);
      setRenderStatus("error");
      setRenderError(e.message || "Failed to start render");
    }
  };

  const pollRenderStatus = async (jobId: string) => {
    setRenderStatus("processing");
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/render-status/${jobId}`);
        if (!response.ok) return;
        const data = await response.json() as any;
        
        if (data.status === "done") {
          clearInterval(interval);
          setRenderStatus("done");
          setRenderUrl(data.downloadUrl);
        } else if (data.status === "error") {
          clearInterval(interval);
          setRenderStatus("error");
          setRenderError(data.error || "Unknown rendering error occurred");
        } else {
          setRenderStatus(data.status || "processing");
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    }, 2000);
  };

  const mediaUrls = useMemo(() => {
    const clipId = videoFile ? `dev-${videoFile.name}` : "sample-footage";
    const mapped: Record<string, string> = {};

    if (videoUrl) {
      mapped[clipId] = videoUrl;
      mapped[`${clipId}_proxy`] = videoUrl;
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
              <h1 className="text-2xl font-serif flex items-center gap-2">
                <FileVideo className="h-6 w-6 text-primary" />
                Editly Engine Showcase
              </h1>
              <p className="text-sm text-muted-foreground">
                Upload a video, describe the vibe, let Gemini generate the configuration, and see Editly render it natively.
              </p>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls & Canvas Preview */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Video File Loader */}
            <Card className="border-border bg-card shadow-md">
              <CardHeader className="py-4 border-b border-border bg-muted/20">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center bg-primary text-primary-foreground h-5 w-5 rounded-full text-xs">1</span>
                  Drop your raw video file
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-primary/20 hover:border-primary/50 rounded-xl p-8 cursor-pointer bg-card transition-all hover:bg-primary/5 group">
                    <Upload className="h-10 w-10 text-muted-foreground mb-3 group-hover:text-primary transition-colors" />
                    <span className="text-base font-medium">Click to upload raw footage</span>
                    <span className="text-sm text-muted-foreground mt-1">MP4, MOV, WebM</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {videoFile && (
                    <div className="text-sm space-y-2 bg-muted/40 p-5 rounded-xl border border-border w-1/3 shadow-sm">
                      <p className="font-semibold text-base truncate" title={videoFile.name}>{videoFile.name}</p>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Size:</span>
                          <span className="font-mono">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Duration:</span>
                          <span className="font-mono">{videoMeta.duration.toFixed(1)}s</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Resolution:</span>
                          <span className="font-mono">{videoMeta.width}x{videoMeta.height}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Native Output */}
            <Card className="border-border bg-card shadow-md overflow-hidden">
              <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between bg-muted/20">
                <div>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <span className="flex items-center justify-center bg-primary text-primary-foreground h-5 w-5 rounded-full text-xs">3</span>
                    Native Editly Output
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Watch what Editly compiles
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setPlaying(!playing)}
                    disabled={renderStatus === "done"}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                    {currentTime.toFixed(1)}s / {videoMeta.duration.toFixed(1)}s
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-6 bg-[#0a0a0a] flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-full max-w-3xl relative">
                  {renderStatus === "done" && renderUrl ? (
                    <video 
                      src={renderUrl} 
                      controls 
                      autoPlay 
                      className="w-full aspect-video border border-border/40 rounded-xl shadow-2xl"
                    />
                  ) : (
                    <SimpleEditorPreview
                      edl={edl}
                      mediaUrls={mediaUrls}
                      currentTime={currentTime}
                      playing={playing}
                      className={`w-full aspect-video border border-border/40 rounded-xl shadow-2xl transition-opacity ${suggestedEffects.length === 0 ? 'opacity-50' : 'opacity-100'}`}
                    />
                  )}
                  
                  {/* Render Overlay Status */}
                  {(renderStatus === "queued" || renderStatus === "processing") && (
                    <div className="absolute inset-0 bg-background/90 backdrop-blur-md z-10 flex flex-col items-center justify-center rounded-xl shadow-xl border border-primary/20 gap-6">
                      <div className="relative">
                        <Loader2 className="h-12 w-12 text-primary animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-4 w-4 bg-primary rounded-full animate-pulse" />
                        </div>
                      </div>
                      <div className="text-center space-y-2">
                        <h3 className="font-serif text-2xl text-foreground">Editly is rendering...</h3>
                        <p className="text-sm text-muted-foreground">Running FFmpeg complex filter graphs and WebGL shaders.</p>
                      </div>
                    </div>
                  )}

                  {renderStatus === "error" && (
                    <div className="absolute inset-0 bg-destructive/10 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl shadow-xl border border-destructive/40 gap-4 p-6 text-center">
                      <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                        <Info className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-destructive">Render Failed</h3>
                        <p className="text-sm text-destructive/80 mt-1 max-w-md">{renderError}</p>
                      </div>
                      <Button variant="outline" onClick={() => setRenderStatus("idle")}>Dismiss</Button>
                    </div>
                  )}

                  {suggestedEffects.length === 0 && renderStatus === "idle" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                      <div className="bg-background/80 backdrop-blur border border-border/50 px-6 py-4 rounded-xl shadow-lg flex flex-col items-center gap-2">
                        <Brain className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Waiting for Gemini instructions...</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <div className="border-t border-border bg-muted/30 p-4 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-primary" />
                    Editly Engine
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Translates the JSON EDL into FFmpeg filter chains and WebGL commands.
                  </p>
                </div>
                <div className="flex gap-3">
                  {renderStatus === "done" && renderUrl && (
                    <Button variant="outline" asChild className="h-10 px-4 gap-2">
                      <a href={renderUrl} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  )}
                  <Button 
                    className="h-10 px-6 gap-2 font-medium"
                    onClick={renderWithEditly}
                    disabled={renderStatus === "queued" || renderStatus === "processing" || suggestedEffects.length === 0}
                  >
                    {renderStatus === "done" ? "Render Again" : "Render MP4"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Gemini Directives Panel */}
          <div className="space-y-4">
            <Card className="border-border bg-card flex flex-col h-full min-h-[500px] shadow-md">
              <CardHeader className="py-4 border-b border-border bg-primary/5">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center bg-primary text-primary-foreground h-5 w-5 rounded-full text-xs">2</span>
                  Gemini Prompt
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Tell Gemini what you want to test in the engine.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 flex-1 flex flex-col gap-6">
                <div className="space-y-3">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., cinematic trailer, retro cyber glitch, emotional blur..."
                    className="min-h-[120px] text-base resize-none bg-card border-border/80 focus:border-primary/50 p-4 leading-relaxed"
                  />
                  <Button
                    onClick={letGeminiThink}
                    disabled={loading || !prompt.trim() || !videoFile}
                    className="w-full h-12 flex items-center justify-center gap-2 text-base font-medium"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Gemini is building EDL...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Generate Instructions
                      </>
                    )}
                  </Button>
                  {!videoFile && (
                    <p className="text-xs text-destructive text-center mt-2">
                      Please upload a video first.
                    </p>
                  )}
                </div>

                {summaryMessage && (
                  <div className="text-sm border rounded-xl p-4 bg-muted/30 border-border text-foreground flex items-start gap-3 shadow-inner">
                    <Info className="h-5 w-5 text-primary shrink-0" />
                    <span className="leading-relaxed">{summaryMessage}</span>
                  </div>
                )}

                {/* Gemini suggestions list */}
                <div className="flex-1 space-y-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Generated EDL Config
                    </h3>
                  </div>

                  {suggestedEffects.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                      Editly is standing by.<br />Click Generate Instructions above.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {suggestedEffects.map((fx, idx) => (
                        <div
                          key={idx}
                          className="bg-card rounded-lg border border-border/80 p-4 space-y-2 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                              {fx.type}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {fx.startTime.toFixed(1)}s - {(fx.startTime + fx.duration).toFixed(1)}s
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-primary/20 pl-2">
                            "{fx.aiRationale}"
                          </p>
                          <div className="flex gap-4 text-xs pt-2">
                            <span className="text-muted-foreground">Intensity: <span className="text-foreground font-mono font-medium">{fx.intensity.toFixed(2)}</span></span>
                            {fx.endIntensity !== undefined && fx.endIntensity !== fx.intensity && (
                              <span className="text-muted-foreground">End: <span className="text-foreground font-mono font-medium">{fx.endIntensity.toFixed(2)}</span></span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
