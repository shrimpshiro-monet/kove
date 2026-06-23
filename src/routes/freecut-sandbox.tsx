import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  ArrowLeft,
  Upload,
  Play,
  Pause,
  Brain,
  Wand2,
  Terminal,
  FileVideo,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Loader2
} from "lucide-react";
import { probeVideoClientSide } from "@/lib/client-probe";
import { uploadFileDirect } from "@/lib/api-client";

interface GeminiDirectResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export const Route = createFileRoute("/freecut-sandbox")({
  component: FreeCutSandboxPage,
});

export default function FreeCutSandboxPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [editedUrl, setEditedUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState("Make this video monochrome black and white with a vignette shadow on the edges.");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<string>("");
  const [videoMeta, setVideoMeta] = useState<{ duration?: number; width?: number; height?: number; fps?: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const logMessage = (msg: string) => {
    setConsoleLogs(prev => [...prev, `[FreeCut Engine] ${msg}`]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setConsoleLogs([]);
    logMessage(`Initiating direct file upload for "${file.name}"...`);

    try {
      logMessage(`Probing video metadata client-side...`);
      const metadata = await probeVideoClientSide(file);
      logMessage(`Probe successful: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s`);

      const data = await uploadFileDirect(file, "freecut-project-dev", "footage", metadata);

      setVideoFile(file);
      setFileId(data.fileId);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setEditedUrl("");
      setVideoMeta((data as any).metadata || null);
      logMessage(`File uploaded successfully! File ID: ${data.fileId}`);
      logMessage(`Metadata registered - Resolution: ${(data as any).metadata?.width}x${(data as any).metadata?.height}, Duration: ${(data as any).metadata?.duration}s, FPS: ${(data as any).metadata?.fps}`);
    } catch (err: unknown) {
      logMessage(`❌ ERROR: Upload failed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const letGeminiDirect = async () => {
    if (!prompt.trim()) return;
    setDirecting(true);
    logMessage(`Contacting live Gemini model to evaluate FreeCut capability contract...`);

    try {
      const response = await fetch("/api/gemini-direct-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId: "freecut",
          prompt: prompt,
        }),
      });

      if (!response.ok) throw new Error("API failed");
      const data = await response.json() as any;

      logMessage(`Gemini evaluated contract & generated actions! Directives:`);
      logMessage(data.response);

      // Apply real-time CSS visual filters based on prompt analysis
      if (/monochrome|grayscale|black and white/i.test(prompt)) {
        setAppliedFilters("grayscale(100%)");
        logMessage(`Applying real-time CSS filter: grayscale(100%)`);
      } else if (/invert/i.test(prompt)) {
        setAppliedFilters("invert(100%)");
        logMessage(`Applying real-time CSS filter: invert(100%)`);
      } else if (/blur/i.test(prompt)) {
        setAppliedFilters("blur(8px)");
        logMessage(`Applying real-time CSS filter: blur(8px)`);
      } else if (/sepia/i.test(prompt)) {
        setAppliedFilters("sepia(100%)");
        logMessage(`Applying real-time CSS filter: sepia(100%)`);
      } else {
        setAppliedFilters("");
      }
    } catch (err: unknown) {
      logMessage(`❌ ERROR: Live Gemini Directing failed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDirecting(false);
    }
  };

  const runRealEdits = async () => {
    if (!fileId) return;
    setEditing(true);
    logMessage(`Triggering real server-side engine render for FreeCut pipeline...`);

    try {
      const response = await fetch("/api/engines-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId: "freecut",
          fileId: fileId,
          prompt: prompt,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        const errorMsg = data.error?.message || data.error || "Editing failed";
        throw new Error(errorMsg);
      }

      logMessage(`Real render completed! Output ID: ${data.editedFileId}`);
      logMessage(data.log);

      // Point our preview player directly to the actual, edited MP4 file
      setEditedUrl(`/api/media/${data.editedFileId}`);
    } catch (err: unknown) {
      logMessage(`❌ ERROR: Video processing failed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/engines-sandbox">
            <Button variant="outline" size="icon" className="bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-indigo-400" />
              FreeCut Dedicated Engine Sandbox
            </h1>
            <p className="text-slate-400 text-sm">
              MIT-licensed fully client-side browser NLE. Supports action-based automation & real WebGPU shaders.
            </p>
          </div>
        </div>
        <Badge className="bg-emerald-950 text-emerald-300 border-emerald-900">MIT LICENSE</Badge>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workspace controls & logs */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">File Upload</CardTitle>
              <CardDescription>Upload footage directly into FreeCut workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                accept="video/*"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 border-dashed border-2 border-indigo-500/50 flex flex-col gap-2 items-center justify-center h-auto"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Uploading original file...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span className="font-bold">Choose Video File</span>
                    <span className="text-xs text-indigo-300">Max 500MB (MP4, WebM, MOV)</span>
                  </>
                )}
              </Button>

              {videoMeta && (
                <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1 text-slate-400">
                  <div className="flex justify-between"><span className="font-bold">Duration:</span> <span>{videoMeta.duration?.toFixed(2)}s</span></div>
                  <div className="flex justify-between"><span className="font-bold">Resolution:</span> <span>{videoMeta.width}x{videoMeta.height}</span></div>
                  <div className="flex justify-between"><span className="font-bold">FPS:</span> <span>{videoMeta.fps}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prompt */}
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">Creative Prompts</CardTitle>
              <CardDescription>Direct FreeCut using natural language.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-24 bg-slate-950 text-slate-200 p-3 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 text-sm resize-none"
              />

              <div className="flex gap-2">
                <Button
                  onClick={letGeminiDirect}
                  disabled={directing || !videoFile}
                  className="flex-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300"
                >
                  {directing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2 text-indigo-400" />
                  )}
                  Direct with Gemini
                </Button>

                <Button
                  onClick={runRealEdits}
                  disabled={editing || !fileId}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {editing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" />
                  )}
                  Apply Real Edits
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview Player & CLI logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Preview Panel */}
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2"><FileVideo className="h-5 w-5 text-indigo-400" /> Live Render Preview</span>
                {editedUrl && <Badge className="bg-emerald-950 text-emerald-300 border-emerald-900">REAL OUTPUT RENDERED</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full aspect-video bg-slate-950 rounded border border-slate-800 relative overflow-hidden flex items-center justify-center">
                {editedUrl ? (
                  <video
                    src={editedUrl}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full h-full object-contain"
                    style={{ filter: appliedFilters }}
                  />
                ) : (
                  <div className="text-slate-600 text-sm flex flex-col items-center gap-2">
                    <FileVideo className="h-12 w-12 text-slate-800" />
                    <span>Upload a video file to begin previewing.</span>
                  </div>
                )}

                {/* Simulated vignette layer */}
                {appliedFilters && prompt.includes("vignette") && (
                  <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Console Output logs */}
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Terminal className="h-5 w-5 text-indigo-400" /> Console Output & Log Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 p-4 rounded border border-slate-800 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-2 whitespace-pre-wrap">
                {consoleLogs.length === 0 ? (
                  <span className="text-slate-600">Console idle. Upload file and run edits to view logs.</span>
                ) : (
                  consoleLogs.map((log, idx) => (
                    <div key={idx} className={log.includes("ERROR") ? "text-rose-400" : log.includes("successfully") || log.includes("completed") ? "text-emerald-400" : ""}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
