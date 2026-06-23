import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { 
  ArrowLeft, 
  Youtube, 
  Upload, 
  Loader2, 
  Sparkles, 
  Search, 
  Zap, 
  Layers, 
  Film, 
  Music, 
  Type, 
  Dna,
  CheckCircle2,
  AlertCircle,
  FileVideo
} from "lucide-react";
import { useEffectsLogger } from "../hooks/use-effects-logger";
import { EffectsLogViewer } from "../components/EffectsLogViewer";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";

// @ts-ignore - Route tree generation pending
interface AnalyzeReferenceResponse {
  success: boolean;
  style?: any;
  error?: string;
}

export const Route = createFileRoute("/reference-analysis")({
  component: ReferenceAnalysisPage,
});

function ReferenceAnalysisPage() {
  const { logs, log, clearLogs } = useEffectsLogger();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleAnalyze = async (params: { youtubeUrl?: string; fileId?: string }) => {
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    
    const target = params.youtubeUrl || params.fileId;
    log("warning", "Starting deep reference analysis", `Target: ${target}`);

    try {
      const response = await fetch("/api/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "test-project-" + Date.now(),
          ...params
        }),
      });

      if (!response.ok) {
        const errData = await response.json() as any;
        throw new Error(errData.error?.message || `Analysis failed with status ${response.status}`);
      }

      const result = await response.json() as AnalyzeReferenceResponse;
      if (result.success && result.style) {
        setAnalysisResult(result.style);
        log("success", "Reference DNA Extracted", `Found ${result.style.rhythm.avgShotDuration}s avg shot duration`);
      } else {
        throw new Error(result.error || "Analysis failed");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to analyze reference.";
      setError(msg);
      log("critical", "Analysis Failure", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setUploadProgress(0);
    log("warning", "Uploading reference file to R2...", `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", "test-project-" + Date.now());
      formData.append("type", "reference");

      const response = await fetch("/api/upload/direct", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json() as any;
        throw new Error(errData.error?.message || "Upload failed");
      }

      const uploadResult = await response.json() as { fileId: string };
      log("success", "File uploaded successfully", `File ID: ${uploadResult.fileId}`);
      
      // Now analyze the uploaded file
      await handleAnalyze({ fileId: uploadResult.fileId });
    } catch (err: any) {
      const msg = err.message || "Failed to upload file.";
      setError(msg);
      log("critical", "Upload Failure", msg);
      setLoading(false);
    }
  };

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
              <h1 className="text-2xl font-serif">Deep Reference DNA Analysis</h1>
              <p className="text-sm text-muted-foreground">
                Dissect the editing style, effects, and cinematic techniques of any video.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5 px-3 py-1">
            <Dna className="h-3.5 w-3.5" />
            Style Intelligence
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Source Selection Tabs */}
            <Tabs defaultValue="youtube" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="youtube" className="gap-2">
                  <Youtube className="h-4 w-4" />
                  YouTube Link
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Local File
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="youtube" className="pt-4">
                <Card className="border-primary/20 bg-primary/5 shadow-sm">
                  <CardHeader className="pb-3 px-4">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      YouTube Reference
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <form 
                      onSubmit={(e) => { e.preventDefault(); handleAnalyze({ youtubeUrl: youtubeUrl.trim() }); }} 
                      className="flex gap-2"
                    >
                      <Input
                        placeholder="Paste YouTube URL..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        className="flex-1 bg-background"
                        disabled={loading}
                      />
                      <Button type="submit" disabled={loading || !youtubeUrl.trim()}>
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        <span className="ml-2">Analyze</span>
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="upload" className="pt-4">
                <Card className="border-primary/20 bg-primary/5 shadow-sm">
                  <CardHeader className="pb-3 px-4">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Upload Video File
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 bg-background/50 hover:bg-background/80 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={loading}
                      />
                      {loading ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                          <span className="text-sm font-medium">Processing Reference...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <FileVideo className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="text-sm font-medium">Click to upload raw reference</span>
                          <span className="text-[10px] text-muted-foreground mt-1">MP4, MOV, WebM (Max 500MB)</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {error && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="p-4 flex items-center gap-3 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm font-medium">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* Analysis Results Display */}
            {analysisResult && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Top Level Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard 
                    label="Pacing" 
                    value={analysisResult.intentMapping?.pacing || "N/A"} 
                    icon={<Zap className="h-4 w-4 text-yellow-500" />} 
                  />
                  <StatCard 
                    label="Color Grade" 
                    value={analysisResult.visualStyle?.colorGrade || "N/A"} 
                    icon={<Film className="h-4 w-4 text-blue-500" />} 
                  />
                  <StatCard 
                    label="Rhythm" 
                    value={`${analysisResult.rhythm?.avgShotDuration?.toFixed(2)}s avg`} 
                    icon={<Music className="h-4 w-4 text-emerald-500" />} 
                  />
                </div>

                {/* Editor Philosophy */}
                <Card>
                  <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Editor's Philosophy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground italic">
                      "{analysisResult.philosophy?.craftBelief}"
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Signature Move</span>
                        <p className="text-sm font-medium">{analysisResult.philosophy?.distinctiveMove}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Rhythm Contract</span>
                        <p className="text-sm font-medium">{analysisResult.philosophy?.rhythmContract}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Visual Style Breakdown */}
                  <Card>
                    <CardHeader className="pb-2 border-b">
                      <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        Visual Signature
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-3">
                        <AttributeRow label="Contrast" value={analysisResult.visualStyle?.contrast} />
                        <AttributeRow label="Saturation" value={analysisResult.visualStyle?.saturation} />
                        <AttributeRow label="Temperature" value={analysisResult.visualStyle?.temperature} />
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Film Grain</span>
                          <Badge variant={analysisResult.visualStyle?.filmGrain ? "default" : "secondary"}>
                            {analysisResult.visualStyle?.filmGrain ? "Present" : "None"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Effects & Transitions */}
                  <Card>
                    <CardHeader className="pb-2 border-b">
                      <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Effects & Transitions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                            <span>Effect Density</span>
                            <span>{(analysisResult.effects?.effectsFrequency * 100).toFixed(0)}%</span>
                          </div>
                          <Progress value={analysisResult.effects?.effectsFrequency * 100} className="h-1.5" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {analysisResult.effects?.commonEffects?.map((fx: string) => (
                            <Badge key={fx} variant="secondary" className="text-[10px] px-2 py-0">
                              {fx.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Typography DNA */}
                <Card>
                  <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                      <Type className="h-4 w-4 text-primary" />
                      Typography DNA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Vibe</span>
                        <p className="text-xs font-medium">{analysisResult.textStyle?.fontVibe}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Pacing</span>
                        <p className="text-xs font-medium">{analysisResult.textStyle?.textPacing}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Position</span>
                        <p className="text-xs font-medium">{analysisResult.textStyle?.positioning}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Animation</span>
                        <p className="text-xs font-medium">{analysisResult.textStyle?.animationStyle}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {!analysisResult && !loading && (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Youtube className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No analysis data yet.</p>
                <p className="text-xs opacity-60">Paste a URL above to start the extraction.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm font-medium">How it works</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs text-muted-foreground leading-relaxed">
                <p>
                  This test page uses Gemini 1.5 Flash's native ability to watch and analyze videos directly via URL.
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>Gemini extracts "Editing DNA" from the reference.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>Calculates rhythm, shot durations, and energy curves.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>Identifies signature effects and transition types.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>Translates aesthetic choices into structured JSON parameters.</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <EffectsLogViewer 
              logs={logs} 
              onClear={clearLogs} 
              className="min-h-[300px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="bg-muted p-2 rounded-lg">{icon}</div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold">{label}</p>
          <p className="text-lg font-serif capitalize">{value.replace(/_/g, " ")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-xs border-b border-border/50 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
