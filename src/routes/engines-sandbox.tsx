import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Terminal,
  ShieldCheck,
  BrainCircuit,
  Settings,
  HelpCircle,
  Code,
  FileJson,
  Sparkles
} from "lucide-react";
import type { SandboxVerificationReport, EngineTestResult } from "../server/lib/test-engines-sandbox";

interface GeminiDirectResponse {
  success: boolean;
  response?: string;
  error?: string;
}

// @ts-ignore - Route tree autogeneration handles this
export const Route = createFileRoute("/engines-sandbox")({
  component: EnginesSandboxPage,
});

export default function EnginesSandboxPage() {
  const [report, setReport] = useState<SandboxVerificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<EngineTestResult | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simulating, setSimulation] = useState(false);
  const [userPrompt, setUserPrompt] = useState("Make a high-energy split cut precisely on the beat, apply chromatic aberration and glow effects, and add a text title overlay.");
  const [liveDirecting, setLiveDirecting] = useState(false);

  // Load the engines sandbox report on load
  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/engines-test");
      if (!response.ok) throw new Error("Failed to fetch report");
      const data = await response.json() as SandboxVerificationReport;
      setReport(data);
      if (data.engines && data.engines.length > 0) {
        setSelectedEngine(data.engines[0]);
      }
    } catch (error) {
      console.error("[engines-sandbox] Error loading report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  // Simulate Gemini directing the engine
  const simulateAiDirector = (engine: EngineTestResult) => {
    setSimulation(true);
    setSimulationLogs([]);
    let logs: string[] = [];

    const addLog = (msg: string, delay: number) => {
      setTimeout(() => {
        setSimulationLogs(prev => [...prev, `[AI Director] ${msg}`]);
      }, delay);
    };

    addLog(`Initiating autonomous controller session for engine "${engine.engineId}"...`, 0);
    addLog(`Loading editing capability contract: ${engine.name} (${engine.license})...`, 500);
    addLog(`Verifying gating status: ${engine.gatingPassed ? "PASSED ✅" : "BLOCKED ❌"}`, 1000);

    if (engine.license.startsWith("GPL")) {
      addLog(`[GPL COMPLIANCE SAFEGUARD] Enforcing Server-Side Headless SaaS Loophole execution. Never distributing client binaries.`, 1500);
    } else if (engine.license.startsWith("LGPL")) {
      addLog(`[LGPL COMPLIANCE SAFEGUARD] Enforcing Dynamic Linking bindings. Ensuring relink capabilities exist.`, 1500);
    } else {
      addLog(`[MIT COMPLIANCE SAFEGUARD] Permissive play. Zero licensing friction. Keep modifications proprietary.`, 1500);
    }

    addLog(`Analyzing creative user intent: "Make an epic anime transition on beat drop"`, 2200);
    addLog(`Gemini formulating optimal edit decisions...`, 3000);

    setTimeout(() => {
      let outputSim = "";
      if (engine.engineId === "freecut") {
        outputSim = JSON.stringify([
          { type: "split", trackId: "video_v1", time: 4.32, rationale: "Sync cut exactly to beat 12" },
          { type: "applyFilter", trackId: "video_v1", filter: "rgb_split", intensity: 0.8, duration: 0.5 },
          { type: "addCaption", trackId: "text_t1", text: "BOOM!", style: "bounce", start: 4.32, duration: 1.0 }
        ], null, 2);
      } else if (engine.engineId === "openreel-video") {
        outputSim = JSON.stringify({
          motionTracks: [{ clipId: "clip_01", method: "face", keyframes: [{ time: 4.32, x: 0.1, y: -0.2 }] }],
          textOverlays: [{ id: "ov_01", text: "IMPACT", startTime: 4.32, endTime: 5.32, tracking: { trackId: "track_01", mode: "behind_subject" } }]
        }, null, 2);
      } else if (engine.engineId === "moviepy") {
        outputSim = `# Python MoviePy script directed by Gemini\nclip = VideoFileClip("footage.mp4").subclip(0, 4.32)\nclip_with_fade = clip.fade_out(0.5)\nclip_with_fade.write_videofile("export.mp4")`;
      } else if (engine.engineId === "mlt-framework") {
        outputSim = `<mlt>\n  <tractor id="t1">\n    <multitrack>\n      <playlist id="video_playlist"><entry src="footage.mp4" in="0" out="130"/></playlist>\n    </multitrack>\n    <filter id="f1" mlt_service="frei0r.glow"><property name="blur">0.6</property></filter>\n  </tractor>\n</mlt>`;
      } else {
        outputSim = `# Headless CLI script under server-only execution\nblender --background --python render_script.py -- --input "footage.mp4" --output "export.mp4" --keyframes "{"scale": 1.2}"`;
      }

      setSimulationLogs(prev => [
        ...prev,
        `\n========== [${engine.name} Capability Contract Simulation] ==========`,
        outputSim
      ]);
      setSimulation(false);
    }, 4000);
  };

  const directWithLiveGemini = async (engine: EngineTestResult) => {
    if (!userPrompt.trim()) return;
    setLiveDirecting(true);
    setSimulationLogs([]);
    setSimulationLogs(prev => [...prev, `[AI Director] Contacting live Gemini model...`]);
    setSimulationLogs(prev => [...prev, `[AI Director] Submitting custom prompt: "${userPrompt}"...`]);
    setSimulationLogs(prev => [...prev, `[AI Director] Enforcing strict license compliance contract for "${engine.name}"...`]);

    try {
      const response = await fetch("/api/gemini-direct-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId: engine.engineId,
          prompt: userPrompt
        })
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const data = await response.json() as GeminiDirectResponse;
      if (data.success) {
        setSimulationLogs(prev => [
          ...prev,
          `[AI Director] LIVE RESPONSE SUCCESSFUL ✅`,
          data.response || ""
        ]);
      } else {
      throw new Error(data.error || "Failed to direct engine");
      }
    } catch (error: unknown) {
      console.error("[engines-sandbox] Live Gemini directing failed:", error);
      setSimulationLogs(prev => [
        ...prev,
        `[AI Director] ❌ ERROR: ${error instanceof Error ? error.message : String(error) || "Failed to contact live Gemini model. Please verify your GEMINI_API_KEY in .dev.vars."}`
      ]);
    } finally {
      setLiveDirecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      {/* Navigation Header */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="outline" size="icon" className="bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-indigo-400" />
              Advanced Video Engines Sandbox
            </h1>
            <p className="text-slate-400 text-sm">
              Verify compliance, manage dynamic gating, and simulate AI director controls for MLT, FreeCut, OpenReel, Kdenlive, and Blender.
            </p>
          </div>
        </div>

        <Button onClick={loadReport} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {loading ? "Auditing..." : "Re-Run Gating Audit"}
        </Button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Compliance Dashboard Overview */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">License Manifest Integrity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">
                  {report?.manifestValid ? "VALID" : "PENDING"}
                </span>
                {report?.manifestValid ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                ) : (
                  <XCircle className="h-8 w-8 text-rose-500" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Conforms to schema version 1.0.0</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Audit Policy Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">
                  {report?.failClosedPolicy ? "FAIL-CLOSED" : "PENDING"}
                </span>
                <ShieldCheck className="h-8 w-8 text-indigo-400" />
              </div>
              <p className="text-xs text-slate-500 mt-1">Enforcing strict commercial permissiveness</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">GPL SaaS loophole safety</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">
                  {report?.saasLoopholeTest?.gatingPassed ? "VERIFIED" : "PENDING"}
                </span>
                {report?.saasLoopholeTest?.gatingPassed ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Non-compliant GPL components correctly blocked</p>
            </CardContent>
          </Card>
        </div>

        {/* Engine compliance list */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-400" />
            Registered Engines
          </h2>

          <div className="space-y-3">
            {report?.engines.map((engine) => (
              <Card 
                key={engine.engineId} 
                onClick={() => setSelectedEngine(engine)}
                className={`cursor-pointer transition-all border-slate-800 hover:border-slate-700 ${
                  selectedEngine?.engineId === engine.engineId ? "bg-slate-900 border-indigo-500 hover:border-indigo-500" : "bg-slate-950"
                } text-slate-100`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{engine.name}</span>
                    <Badge variant={engine.gatingPassed ? "default" : "destructive"} className={engine.gatingPassed ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"}>
                    {engine.gatingPassed ? "PASSED" : "BLOCKED"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>License: {engine.license}</span>
                    <span className="text-indigo-400">{engine.commercialUse ? "Commercial" : "Non-Comm."}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* SaaS Loophole Safeguard Log Card */}
          <Card className="bg-slate-950 border-slate-800 text-slate-100">
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-indigo-400" />
                Compliance Safeguard Sandbox
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-slate-400 space-y-2">
              <p>
                To prevent licensing infection, the system runs an active safeguard test. We injected a mock GPL component without SaaS constraints:
              </p>
              <div className="bg-slate-900 p-2 rounded border border-slate-800 font-mono text-rose-400">
                {report?.saasLoopholeTest?.errorMessage || "Pending verification..."}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2 space-y-6">
          {selectedEngine ? (
            <div className="space-y-6">
              {/* Engine Details */}
              <Card className="bg-slate-900 border-slate-800 text-slate-100">
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                        {selectedEngine.name}
                        <Badge className="bg-indigo-950 text-indigo-300 border-indigo-900">
                          {selectedEngine.license}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-slate-400 mt-1">
                        {selectedEngine.notes || "No notes available for this engine."}
                      </CardDescription>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      {/* Navigate to dedicated engine sandbox page */}
                      <Link 
                        to={
                          selectedEngine.engineId === "freecut" ? "/freecut-sandbox" :
                          selectedEngine.engineId === "openreel-video" ? "/openreel-sandbox" :
                          selectedEngine.engineId === "moviepy" ? "/moviepy-sandbox" :
                          selectedEngine.engineId === "mlt-framework" ? "/mlt-sandbox" :
                          selectedEngine.engineId === "kdenlive" ? "/kdenlive-sandbox" :
                          selectedEngine.engineId === "kubeezcut" ? "/kubeezcut-sandbox" :
                          selectedEngine.engineId === "omniclip" ? "/omniclip-sandbox" :
                          selectedEngine.engineId === "ffmpeg" ? "/ffmpeg-sandbox" :
                          selectedEngine.engineId === "natron" ? "/natron-sandbox" :
                          selectedEngine.engineId === "opencut" ? "/opencut-sandbox" :
                          selectedEngine.engineId === "shotcut" ? "/shotcut-sandbox" :
                          "/blender-sandbox"
                        }
                      >
                        <Button
                          variant="outline"
                          className="w-full bg-emerald-950 border-emerald-900 hover:bg-emerald-900 text-emerald-300 flex items-center gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Open Dedicated Playground
                        </Button>
                      </Link>

                      <Button 
                        onClick={() => simulateAiDirector(selectedEngine)}
                        disabled={simulating || liveDirecting}
                        variant="outline"
                        className="bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-300 flex items-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        {simulating ? "Simulating..." : "Run Offline Simulation"}
                      </Button>

                      <Button 
                        onClick={() => directWithLiveGemini(selectedEngine)}
                        disabled={simulating || liveDirecting}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
                      >
                        <BrainCircuit className="h-4 w-4" />
                        {liveDirecting ? "Directing..." : "Direct with Live Gemini"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Code className="h-4 w-4 text-indigo-400" />
                      Dynamic Compliance Strategy
                    </h3>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs text-slate-300">
                      {selectedEngine.engineId === "freecut" && "Permissive Stack Base (MIT). Free to modify, bundle, and compile client-side."}
                      {selectedEngine.engineId === "mlt-framework" && "Dynamic Linking Only (LGPL). Links to server-side MLT libraries, keeping UI completely closed-source."}
                      {selectedEngine.engineId === "openreel-video" && "Permissive MIT license. Complete control over advanced effects, tracked typography, and SAM 2 subject layering."}
                      {selectedEngine.engineId === "moviepy" && "Permissive MIT license. Ideal for server-side Python macro scripts and quick splicing."}
                      {selectedEngine.license.startsWith("GPL") && "SaaS Loophole Isolation (GPL). Executed strictly server-side (headless). Client binaries are never compiled or distributed."}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-indigo-400" />
                      Directives & Capability Contract
                    </h3>
                    <div className="bg-slate-950 p-4 rounded border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap h-64 overflow-y-auto">
                      {selectedEngine.contract}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Creative Prompt Input */}
              <Card className="bg-slate-900 border-slate-800 text-slate-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-indigo-400" />
                    Creative AI Prompt Playground
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Enter any video editing request below, and click "Direct with Live Gemini" above to have Gemini dynamically generate legally-compliant editing directives specifically for {selectedEngine.name}!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Enter editing request..."
                    className="w-full h-20 bg-slate-950 text-slate-200 p-3 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 text-sm font-sans resize-none"
                  />
                </CardContent>
              </Card>

              {/* Live Simulation Console */}
              <Card className="bg-slate-900 border-slate-800 text-slate-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-indigo-400" />
                    Autonomous Control Plane Console
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    See how Gemini evaluates this engine's contract and produces license-compliant editing instructions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-950 p-4 rounded border border-slate-800 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-2">
                    {simulationLogs.length === 0 ? (
                      <span className="text-slate-600">Console idle. Awaiting simulation...</span>
                    ) : (
                      simulationLogs.map((log, index) => {
                        const isJson = log.trim().startsWith("{") || log.trim().startsWith("[");
                        return (
                          <div key={index} className={log.includes("SUCCESS") ? "text-emerald-400" : log.includes("Safeguard") ? "text-amber-400" : ""}>
                            {isJson ? (
                              <pre className="text-indigo-300 mt-2 bg-slate-900/50 p-2 rounded border border-slate-900 overflow-x-auto">
                                {log}
                              </pre>
                            ) : (
                              log
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-96 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500">
              <BrainCircuit className="h-12 w-12 text-slate-700 mb-4" />
              <span>Select an engine from the list to inspect capability contract and run simulation.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
