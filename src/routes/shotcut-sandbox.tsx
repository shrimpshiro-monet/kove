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
  ShieldCheck,
  Loader2
} from "lucide-react";

interface GeminiDirectResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export const Route = createFileRoute("/shotcut-sandbox")({
  component: ShotcutSandboxPage,
});

export default function ShotcutSandboxPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [editedUrl, setEditedUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState("Direct Shotcut server-side rendering to add high-energy zoom-pulses and dynamic chromatic aberration.");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [videoMeta, setVideoMeta] = useState<{ duration?: number; width?: number; height?: number; fps?: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const logMessage = (msg: string) => {
    setConsoleLogs(prev => [...prev, `[Shotcut Engine] ${msg}`]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setConsoleLogs([]);
    logMessage(`Initiating direct file upload for "${file.name}"...`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", "shotcut-project-dev");
    formData.append("type", "footage");

    try {
      const response = await fetch("/api/upload/direct", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json() as any;

      setVideoFile(file);
      setFileId(data.fileId);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setEditedUrl("");
      setVideoMeta(data.metadata || null);
      logMessage(`File uploaded successfully! File ID: ${data.fileId}`);
    } catch (err: unknown) {
      logMessage(`❌ ERROR: Upload failed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const letGeminiDirect = async () => {
    if (!prompt.trim()) return;
    setDirecting(true);
    logMessage(`Contacting live Gemini model to evaluate Shotcut headless scripting...`);

    try {
      const response = await fetch("/api/gemini-direct-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId: "shotcut",
          prompt: prompt,
        }),
      });

      if (!response.ok) throw new Error("API failed");
      const data = await response.json() as any;

      logMessage(`Gemini evaluated contract & generated headless script:`);
      logMessage(data.response);
    } catch (err: unknown) {
      logMessage(`❌ ERROR: Live Gemini Directing failed. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDirecting(false);
    }
  };

  const runRealEdits = async () => {
    if (!fileId) return;
    setEditing(true);
    logMessage(`Triggering real server-side engine render for Shotcut pipeline...`);

    try {
      const response = await fetch("/api/engines-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId: "shotcut",
          fileId: fileId,
          prompt: prompt,
        }),
      });

      if (!response.ok) throw new Error("Editing failed");
      const data = await response.json() as any;

      logMessage(`Real render completed! Output ID: ${data.editedFileId}`);
      logMessage(data.log);

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
              <ShieldCheck className="h-8 w-8 text-indigo-400" />
              Shotcut Dedicated Engine Sandbox
            </h1>
            <p className="text-slate-400 text-sm">
              GPL-licensed 3D creation suite. Enforces safety under the SaaS Loophole (headless server isolation).
            </p>
          </div>
        </div>
        <Badge className="bg-rose-950 text-rose-300 border-rose-900">GPL LICENSE (SaaS Loophole)</Badge>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">File Upload</CardTitle>
              <CardDescription>Upload clip for headless Shotcut rendering.</CardDescription>
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
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
                <span className="font-bold">Choose Video File</span>
              </Button>
            </CardContent>
          </Card>

          {/* Prompts */}
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">Creative Directives</CardTitle>
              <CardDescription>Instruct Gemini to direct Shotcut scripts.</CardDescription>
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
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-300"
                >
                  Direct with Gemini
                </Button>

                <Button
                  onClick={runRealEdits}
                  disabled={editing || !fileId}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Apply Real Edits
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">Shotcut Render Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <div className="w-full aspect-video bg-slate-950 rounded border border-slate-800 relative flex items-center justify-center overflow-hidden">
                {editedUrl ? (
                  <video
                    src={editedUrl}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-slate-600 text-sm flex flex-col items-center gap-2">
                    <FileVideo className="h-12 w-12 text-slate-800" />
                    <span>Upload a video file to begin previewing.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Console logs */}
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">Console Output Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 p-4 rounded border border-slate-800 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-2">
                {consoleLogs.length === 0 ? (
                  <span className="text-slate-600">Console idle. Run edits to view logs.</span>
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
