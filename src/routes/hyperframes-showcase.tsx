import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Slider } from "../components/ui/slider";
import { Upload, Play, Pause, Sparkles, Brain, ArrowLeft, Loader2, Info, Layers, RefreshCw, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

// @ts-ignore - Route tree generation pending
export const Route = createFileRoute("/hyperframes-showcase")({
  component: HyperframesShowcasePage,
});

function HyperframesShowcasePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoMeta, setVideoMetadata] = useState<{ duration: number; width: number; height: number }>({
    duration: 10,
    width: 1280,
    height: 720,
  });

  const [prompt, setPrompt] = useState("A futuristic neon cyberpunk overlay with glitching text, grid scanlines, and audio-reactive elements scaling to the beat.");
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [compositionHtml, setCompositionHtml] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState("");
  
  // Playback state
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Stop playback loop
  const stopLoop = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  // Dispatch hf-seek message to iframe
  const seekIframe = (time: number) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "hf-seek", time }, "*");
    }
  };

  // Playback loop
  useEffect(() => {
    stopLoop();
    if (!playing) {
      seekIframe(currentTime);
      return;
    }

    const startWallTime = performance.now();
    const startTimelineTime = currentTime;

    const tick = () => {
      const elapsed = (performance.now() - startWallTime) / 1000;
      let nextTime = startTimelineTime + elapsed;
      
      // Loop around
      if (nextTime > videoMeta.duration) {
        nextTime = nextTime % videoMeta.duration;
      }

      setCurrentTime(nextTime);
      seekIframe(nextTime);
      
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => stopLoop();
  }, [playing]);

  // Handle local video loading & analysis
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);

    setCompositionHtml(null);
    setSummaryMessage("");
    setCurrentTime(0);
    setPlaying(false);

    // Get basic metadata immediately
    const tempVideo = document.createElement("video");
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoMetadata({
        duration: tempVideo.duration || 10,
        width: tempVideo.videoWidth || 1280,
        height: tempVideo.videoHeight || 720,
      });
    };

    // Trigger true backend upload & analysis to get real beats and BPM
    setIsAnalyzing(true);
    try {
      // 1. Upload
      const formData = new FormData();
      formData.append("file", file);
      
      const uploadRes = await fetch("/api/upload/direct", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json() as any;
      const fileId = uploadData.fileId;

      // 2. Analyze
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!analyzeRes.ok) throw new Error("Analysis failed");
      const analysis = await analyzeRes.json() as any;

      setAnalysisData(analysis);
      setSummaryMessage(`Video analyzed: ${analysis.music?.bpm?.toFixed(0) || 120} BPM detected.`);
    } catch (err: any) {
      console.error(err);
      setSummaryMessage("Warning: Audio analysis failed, using fallback metrics.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle manual scrub
  const handleScrub = (time: number) => {
    setCurrentTime(time);
    seekIframe(time);
  };

  const letGeminiThink = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSummaryMessage("");
    setPlaying(false);
    setCurrentTime(0);

    try {
      // Construct a TRUE EDL using actual analysis data
      let bpm = 120;
      let beatGrid: number[] = [];
      let shots = [{ source: { clipId: "demo" }, timing: { duration: videoMeta.duration } }];

      if (analysisData) {
        bpm = analysisData.music?.bpm || 120;
        beatGrid = analysisData.music?.beatGrid || [];
        if (analysisData.shots && analysisData.shots.length > 0) {
          shots = analysisData.shots.map((s: any) => ({
            source: { clipId: "demo", inPoint: s.startTime, outPoint: s.endTime },
            timing: { startTime: s.startTime, duration: s.duration }
          }));
        }
      }

      // Fill in fallback beats if analysis returned empty
      if (beatGrid.length === 0) {
        const beatInterval = 60 / bpm;
        beatGrid = Array.from({ length: Math.ceil(videoMeta.duration / beatInterval) }, (_, i) => i * beatInterval);
      }

      const realEdl = {
        timeline: { duration: videoMeta.duration },
        music: { bpm: bpm, beatGrid: beatGrid },
        shots: shots,
        globalEffects: { colorGrade: "raw" }
      };

      const response = await fetch("/api/generate-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          edl: realEdl,
          intent: { 
            style: { notes: prompt } 
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const result = (await response.json()) as any;
      if (result.success && result.html) {
        setCompositionHtml(result.html);
        setSummaryMessage(`HyperFrames Composition generated successfully via ${result.source}!`);
      } else {
        throw new Error(result.error || "Failed to generate composition");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to communicate with Gemini. Please check your API key.";
      console.error("[Gemini generate composition error]", err);
      setSummaryMessage(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Convert HTML to Blob URL to safely inject into iframe
  const srcDocUrl = useMemo(() => {
    if (!compositionHtml) return undefined;
    const blob = new Blob([compositionHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [compositionHtml]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-serif flex items-center gap-2">
                <Layers className="h-6 w-6 text-indigo-500" />
                HyperFrames Engine Showcase
              </h1>
              <p className="text-sm text-muted-foreground">
                Test the deterministic HTML5 rendering engine. Write a prompt to generate interactive overlays, titles, and VFX.
              </p>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Prompt & Config Panel */}
          <div className="space-y-6">
            <Card className="border-border bg-card shadow-md">
              <CardHeader className="py-4 border-b border-border bg-indigo-500/5">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center bg-indigo-500 text-white h-5 w-5 rounded-full text-xs">1</span>
                  Design the Composition
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Describe the kinetic typography, WebGL shaders, or GSAP animations you want.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                
                <label className={`w-full flex flex-col items-center justify-center border-2 border-dashed ${videoFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-border'} hover:border-indigo-500/50 rounded-xl p-6 cursor-pointer bg-card transition-all`}>
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                      <span className="text-sm font-medium">Analyzing audio & shots...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className={`h-8 w-8 ${videoFile ? 'text-indigo-500' : 'text-muted-foreground'} mb-2`} />
                      <span className="text-sm font-medium">{videoFile ? videoFile.name : "Click to upload a video to test"}</span>
                      {analysisData && <span className="text-xs text-indigo-500 mt-1 font-mono">BPM: {Math.round(analysisData.music?.bpm || 120)} | Shots: {analysisData.shots?.length || 1}</span>}
                    </>
                  )}
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isAnalyzing}
                  />
                </label>

                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A retro vaporwave sunset grid with 'Hello World' sliding in..."
                  className="min-h-[120px] text-base resize-none bg-background border-border/80 focus:border-indigo-500/50 p-4 leading-relaxed"
                />
                
                <div className="flex items-center gap-4 border border-border/50 bg-muted/20 p-3 rounded-lg">
                  <div className="text-sm font-medium">Timeline Length:</div>
                  <div className="font-mono text-sm text-muted-foreground">{videoMeta.duration.toFixed(1)} seconds</div>
                </div>

                <Button
                  onClick={letGeminiThink}
                  disabled={loading || isAnalyzing || !prompt.trim()}
                  className="w-full h-12 flex items-center justify-center gap-2 text-base font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Compiling HTML & JS...
                    </>
                  ) : (
                    <>
                      <Brain className="h-5 w-5" />
                      Generate HyperFrames Overlay
                    </>
                  )}
                </Button>

                {summaryMessage && (
                  <div className="text-sm border rounded-xl p-4 bg-muted/30 border-border flex items-start gap-3 shadow-inner">
                    <Info className="h-5 w-5 text-indigo-500 shrink-0" />
                    <span className="leading-relaxed">{summaryMessage}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Code Inspection (Optional View) */}
            <Card className="border-border bg-card shadow-md">
              <CardHeader className="py-4 border-b border-border bg-muted/20">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Code Inspector
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-border bg-transparent p-0 h-10">
                    <TabsTrigger value="html" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-muted/20">Raw Output</TabsTrigger>
                    <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-muted/20">How it works</TabsTrigger>
                  </TabsList>
                  <TabsContent value="html" className="m-0 border-none p-0">
                    {compositionHtml ? (
                      <pre className="p-4 text-xs font-mono bg-[#0d0d0d] text-green-400 h-[300px] overflow-y-auto w-full custom-scrollbar">
                        {compositionHtml}
                      </pre>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                        No code generated yet.
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="info" className="m-0 p-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
                    <p>
                      <strong>HyperFrames</strong> is the deterministic HTML5 rendering layer of Monet. It allows you to use standard web technologies like CSS, GSAP, WebGL, and Canvas to draw overlays.
                    </p>
                    <p>
                      The core rule: Everything must be deterministic. The wrapper page sends a <code className="text-indigo-400">hf-seek</code> postMessage to the iframe. The iframe listens for this and forces all GSAP timelines or CSS animations to that exact millisecond.
                    </p>
                    <p>
                      This guarantees that when FFmpeg grabs a screenshot of the chromium instance at frame 142, the WebGL shader and text positions are in the exact same place they are in the browser preview.
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* HyperFrames Interactive Player */}
          <div className="space-y-4">
            <Card className="border-border bg-card shadow-md overflow-hidden">
              <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between bg-indigo-500/5">
                <div>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <span className="flex items-center justify-center bg-indigo-500 text-white h-5 w-5 rounded-full text-xs">2</span>
                    Interactive Player
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded border border-border/50 shadow-inner">
                    {currentTime.toFixed(2)}s / {videoMeta.duration.toFixed(2)}s
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="p-0 bg-black flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-full relative aspect-video bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-zinc-900 overflow-hidden">
                  
                  {/* Background Video */}
                  {videoUrl ? (
                    <video 
                      src={videoUrl} 
                      className="absolute inset-0 w-full h-full object-cover z-0" 
                      style={{ opacity: 0.8 }}
                      muted
                      ref={(el) => {
                        if (el) {
                          el.currentTime = currentTime;
                          if (playing) el.play().catch(() => {});
                          else el.pause();
                        }
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 z-0 opacity-30 pointer-events-none flex items-center justify-center text-zinc-600 font-bold text-4xl tracking-widest uppercase">
                      NO FOOTAGE
                    </div>
                  )}

                  {/* The actual sandbox iframe */}
                  {srcDocUrl ? (
                    <iframe
                      ref={iframeRef}
                      src={srcDocUrl}
                      className="absolute inset-0 w-full h-full border-none z-10 bg-transparent"
                      title="HyperFrames Render Context"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-muted-foreground gap-3">
                      <Layers className="h-10 w-10 opacity-50 drop-shadow-xl" />
                      <p className="text-sm font-medium drop-shadow-lg text-white">Awaiting Composition</p>
                    </div>
                  )}
                </div>
              </CardContent>

              {/* Player Controls */}
              <div className="border-t border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant={playing ? "secondary" : "default"}
                    size="icon"
                    className="h-12 w-12 rounded-full shrink-0 shadow-md"
                    onClick={() => setPlaying(!playing)}
                    disabled={!compositionHtml}
                  >
                    {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
                  </Button>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                      <span>0.0s</span>
                      <span className="text-indigo-500 font-bold">hf-seek</span>
                      <span>{videoMeta.duration.toFixed(1)}s</span>
                    </div>
                    <Slider
                      value={[currentTime]}
                      min={0}
                      max={videoMeta.duration}
                      step={0.01}
                      onValueChange={([val]) => {
                        setPlaying(false);
                        handleScrub(val);
                      }}
                      disabled={!compositionHtml}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
