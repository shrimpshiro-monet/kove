import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/style-lab")({
  component: StyleLabPage,
});

type LogEntry = { time: string; tag: string; msg: string; ok?: boolean };
type StepStatus = "idle" | "running" | "done" | "error";

interface DetectedSegment {
  index: number;
  startTime: number;
  duration: number;
  endTime: number;
}

interface FootageSceneData {
  fileId: string;
  fileName: string;
  preview: string;
  totalDuration: number;
  shotCount: number;
  segments: DetectedSegment[];
  selectedIndices: number[];
}

const API = "";

function logFn(set: React.Dispatch<React.SetStateAction<LogEntry[]>>, tag: string, msg: string, ok?: boolean) {
  const time = new Date().toISOString().slice(11, 23);
  set((prev) => [...prev, { time, tag, msg, ok }]);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function uploadFile(file: File, projectId: string, type: "footage" | "music" | "reference"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectId", projectId);
  fd.append("type", type);
  const res = await fetch(`${API}/api/upload/direct`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  return data.fileId;
}

function StepHeader({ label, status }: { label: string; status: StepStatus }) {
  const icon = status === "done" ? "\u2705" : status === "error" ? "\u274C" : status === "running" ? "\u23F3" : "\u25CB";
  return (
    <div className="flex items-center gap-2 mt-6 mb-2">
      <span className="text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">{label}</h2>
    </div>
  );
}

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  return (
    <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-3 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed">
      {logs.length === 0 && <span className="text-neutral-600">No logs yet.</span>}
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-neutral-600 shrink-0">{l.time}</span>
          <span className={`shrink-0 ${l.ok === true ? "text-green-400" : l.ok === false ? "text-red-400" : "text-neutral-500"}`}>[{l.tag}]</span>
          <span className="text-neutral-300 break-all">{l.msg}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-neutral-500 hover:text-neutral-300 underline">
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && (
        <pre className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-3 max-h-80 overflow-auto font-mono text-xs text-neutral-300 break-all whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ScoreCard({ score }: { score: { total: number; breakdown: Record<string, number>; details: string[] } | null }) {
  if (!score) return null;
  const bar = (val: number, max: number) => (
    <div className="flex items-center gap-2">
      <div className="w-32 h-2 bg-neutral-800 rounded overflow-hidden">
        <div className="h-full bg-orange-500 rounded" style={{ width: `${(val / max) * 100}%` }} />
      </div>
      <span className="text-xs text-neutral-400 w-10 text-right">{val}/{max}</span>
    </div>
  );
  return (
    <div className="mt-3 rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-2xl font-bold text-orange-400 mb-3">{score.total}/100</div>
      {Object.entries(score.breakdown).map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 mb-1">
          <span className="text-xs text-neutral-400 w-32">{k}</span>
          {bar(v, 25)}
        </div>
      ))}
      <div className="mt-3 space-y-1">
        {score.details.map((d, i) => (
          <div key={i} className="text-xs text-neutral-500">- {d}</div>
        ))}
      </div>
    </div>
  );
}

function SegmentTimeline({ footage, fileIndex, onToggle }: { footage: FootageSceneData; fileIndex: number; onToggle: (fileIdx: number, segIdx: number) => void }) {
  const selectedSet = new Set(footage.selectedIndices);
  const totalSelected = footage.segments.filter((_, i) => selectedSet.has(i)).reduce((s, seg) => s + seg.duration, 0);

  return (
    <div className="mt-2 rounded border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-neutral-400">
          {footage.fileName} — {footage.shotCount} scenes, {footage.totalDuration.toFixed(1)}s total
        </span>
        <span className="text-xs text-orange-400">
          {selectedSet.size}/{footage.segments.length} selected ({totalSelected.toFixed(1)}s)
        </span>
      </div>

      <div className="flex gap-0.5 mb-2">
        {footage.segments.map((seg, i) => {
          const pct = (seg.duration / footage.totalDuration) * 100;
          const sel = selectedSet.has(i);
          return (
            <div
              key={i}
              onClick={() => onToggle(fileIndex, i)}
              className={`h-6 cursor-pointer rounded-sm transition-colors ${
                sel ? "bg-orange-600 hover:bg-orange-500" : "bg-neutral-700 hover:bg-neutral-600"
              }`}
              style={{ width: `${Math.max(pct, 0.5)}%` }}
              title={`Scene ${i}: ${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(1)}s (${seg.duration.toFixed(1)}s)${sel ? " [SELECTED]" : ""}`}
            />
          );
        })}
      </div>

      <div className="max-h-32 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="text-left py-0.5 pr-2">#</th>
              <th className="text-left py-0.5 pr-2">Start</th>
              <th className="text-left py-0.5 pr-2">End</th>
              <th className="text-left py-0.5 pr-2">Duration</th>
              <th className="text-left py-0.5">Use</th>
            </tr>
          </thead>
          <tbody>
            {footage.segments.map((seg, i) => (
              <tr key={i} className={selectedSet.has(i) ? "text-orange-300" : "text-neutral-500"}>
                <td className="py-0.5 pr-2">{i}</td>
                <td className="py-0.5 pr-2">{seg.startTime.toFixed(2)}s</td>
                <td className="py-0.5 pr-2">{seg.endTime.toFixed(2)}s</td>
                <td className="py-0.5 pr-2">{seg.duration.toFixed(2)}s</td>
                <td className="py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(i)}
                    onChange={() => onToggle(fileIndex, i)}
                    className="accent-orange-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex gap-2">
        <button onClick={() => onToggle(fileIndex, -1)}
          className="text-xs text-neutral-500 hover:text-neutral-300 underline">Select all</button>
        <button onClick={() => onToggle(fileIndex, -2)}
          className="text-xs text-neutral-500 hover:text-neutral-300 underline">Deselect all</button>
        <button onClick={() => onToggle(fileIndex, -3)}
          className="text-xs text-neutral-500 hover:text-neutral-300 underline">Every other</button>
      </div>
    </div>
  );
}

function StyleLabPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const l = useCallback((tag: string, msg: string, ok?: boolean) => logFn(setLogs, tag, msg, ok), []);

  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [footageFiles, setFootageFiles] = useState<File[]>([]);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicPreview, setMusicPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Edit this like the reference — match the cuts, effects, color, and energy.");

  const [refStep, setRefStep] = useState<StepStatus>("idle");
  const [sceneStep, setSceneStep] = useState<StepStatus>("idle");
  const [genStep, setGenStep] = useState<StepStatus>("idle");
  const [expStep, setExpStep] = useState<StepStatus>("idle");

  const [refStyle, setRefStyle] = useState<any>(null);
  const [footageScenes, setFootageScenes] = useState<FootageSceneData[]>([]);
  const [edl, setEdl] = useState<any>(null);
  const [score, setScore] = useState<any>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<number | null>(null);

  const projectIdRef = useRef(`lab-${Date.now()}`);
  const footageIdsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      if (refPreview) URL.revokeObjectURL(refPreview);
      footageScenes.forEach(f => URL.revokeObjectURL(f.preview));
      if (musicPreview) URL.revokeObjectURL(musicPreview);
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, []);

  const handleRefFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefFile(f);
    setRefPreview(URL.createObjectURL(f));
    l("INPUT", `Reference: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
  };

  const handleFootage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    footageScenes.forEach(f => URL.revokeObjectURL(f.preview));
    setFootageFiles(files);
    setFootageScenes([]);
    l("INPUT", `Footage: ${files.length} file(s): ${files.map(f => f.name).join(", ")}`);

    // Auto-detect scenes for each footage file
    setSceneStep("running");
    const projectId = projectIdRef.current;
    const newScenes: FootageSceneData[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      l("SCENE", `[${i + 1}/${files.length}] Uploading ${f.name}...`);
      try {
        const fileId = await uploadFile(f, projectId, "footage");
        footageIdsRef.current[i] = fileId;
        l("SCENE", `Uploaded ${f.name}: ${fileId}`, true);

        l("SCENE", `Running deep analysis (PySceneDetect + optical flow + color + flash frames)...`);
        let result: any;
        try {
          result = await apiPost<any>("/api/deep-analysis", { fileId });
        } catch {
          l("SCENE", `Deep analysis unavailable, falling back to scene detection...`);
          result = await apiPost<any>("/api/detect-scenes", { fileId, threshold: 0.3 });
          result.shots = (result.segments || []).map((s: any) => ({
            start_time: s.startTime, end_time: s.endTime, duration: s.duration,
          }));
          result.total_duration = result.totalDuration;
          result.cut_frequency = result.cutFrequency;
          result.velocity_curve = [];
          result.color_samples = [];
          result.flash_frames = [];
          result.dominant_palette = [];
          result.audio = null;
          result.pacing = "medium";
          result.summary = { shot_count: result.shots.length };
        }
        l("SCENE", `${f.name}: ${result.shots?.length ?? 0} shots, ${result.total_duration?.toFixed(1)}s, ${result.cut_frequency?.toFixed(2)} cuts/s, pacing=${result.pacing}`, true);
        l("SCENE-DETAIL", `Velocity: ${result.velocity_curve?.length ?? 0} samples, Color: ${result.color_samples?.length ?? 0} samples, Flashes: ${result.flash_frames?.length ?? 0}`);
        if (result.audio) {
          l("SCENE-DETAIL", `Audio: BPM=${result.audio.bpm?.toFixed(1)}, beats=${result.audio.beats?.length ?? 0}, onsets=${result.audio.onsets?.length ?? 0}`);
        }
        if (result.dominant_palette?.length > 0) {
          l("SCENE-DETAIL", `Palette: ${result.dominant_palette.join(", ")}`);
        }

        const segments = (result.shots || []).map((s: any, idx: number) => ({
          index: idx,
          startTime: s.start_time,
          duration: s.duration,
          endTime: s.end_time,
        }));

        const allSelected = segments.map((_: any, idx: number) => idx);
        newScenes.push({
          fileId,
          fileName: f.name,
          preview: URL.createObjectURL(f),
          totalDuration: result.total_duration || 0,
          shotCount: segments.length,
          segments,
          selectedIndices: allSelected,
        });
      } catch (err: any) {
        l("SCENE", `Scene detection failed for ${f.name}: ${err.message}`, false);
      }
    }

    setFootageScenes(newScenes);
    setSceneStep(newScenes.length > 0 ? "done" : "error");
    l("SCENE", `Scene detection complete: ${newScenes.length}/${files.length} files processed`, newScenes.length > 0);
  };

  const handleMusicFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (musicPreview) URL.revokeObjectURL(musicPreview);
    setMusicFile(f);
    setMusicPreview(URL.createObjectURL(f));
    l("INPUT", `Music: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
  };

  const handleToggleSegment = useCallback((fileIdx: number, segIdx: number) => {
    setFootageScenes(prev => prev.map((fs, fi) => {
      if (fi !== fileIdx) return fs;
      let newIndices: number[];
      if (segIdx === -1) {
        newIndices = fs.segments.map((_, i) => i);
      } else if (segIdx === -2) {
        newIndices = [];
      } else if (segIdx === -3) {
        newIndices = fs.segments.map((_, i) => i).filter(i => i % 2 === 0);
      } else {
        const has = fs.selectedIndices.includes(segIdx);
        newIndices = has ? fs.selectedIndices.filter(i => i !== segIdx) : [...fs.selectedIndices, segIdx];
      }
      return { ...fs, selectedIndices: newIndices };
    }));
  }, []);

  const getSelectedSegmentData = () => {
    const selected: Array<{ fileId: string; fileName: string; inPoint: number; outPoint: number; duration: number }> = [];
    for (const fs of footageScenes) {
      for (const i of fs.selectedIndices) {
        const seg = fs.segments[i];
        if (seg) {
          selected.push({
            fileId: fs.fileId,
            fileName: fs.fileName,
            inPoint: seg.startTime,
            outPoint: seg.endTime,
            duration: seg.duration,
          });
        }
      }
    }
    return selected;
  };

  const runPipeline = async () => {
    if (!refFile || footageScenes.length === 0) {
      l("ERROR", "Need reference video + footage with detected scenes", false);
      return;
    }

    const selectedSegments = getSelectedSegmentData();
    if (selectedSegments.length === 0) {
      l("ERROR", "Select at least one footage segment", false);
      return;
    }

    setLogs([]);
    setRefStyle(null);
    setEdl(null);
    setScore(null);
    setExportUrl(null);
    setExportSize(null);
    const projectId = projectIdRef.current;

    // ── Step 1: Upload reference ──
    setRefStep("running");
    l("UPLOAD", "Uploading reference video...");
    let refFileId: string;
    try {
      refFileId = await uploadFile(refFile, projectId, "reference");
      l("UPLOAD", `Reference uploaded: ${refFileId}`, true);
    } catch (e: any) {
      l("UPLOAD", `Reference upload failed: ${e.message}`, false);
      setRefStep("error");
      return;
    }

    // ── Step 2: Analyze reference ──
    l("ANALYZE", "Running reference analysis (scene detection + energy + LLM + extractors)...");
    let style: any;
    try {
      const result = await apiPost<any>("/api/analyze-reference", { projectId, referenceFileId: refFileId });
      style = result.style;
      setRefStyle(style);
      l("ANALYZE", `Reference analysis complete. Confidence: ${style.confidence}`, true);

      const hasVocab = style.effectVocabulary?.length > 0;
      const hasColors = style.colorGrades?.length > 0;
      const hasVelocity = style.velocityRamps?.length > 0;
      const hasFlash = style.flashFrames?.length > 0;
      const hasProfile = style.colorProfile != null;

      l("ANALYZE-DETAIL", `effectVocabulary: ${style.effectVocabulary?.length ?? 0} shots`, hasVocab);
      l("ANALYZE-DETAIL", `colorGrades: ${style.colorGrades?.length ?? 0} keyframes`, hasColors);
      l("ANALYZE-DETAIL", `velocityRamps: ${style.velocityRamps?.length ?? 0} ramps`, hasVelocity);
      l("ANALYZE-DETAIL", `flashFrames: ${style.flashFrames?.length ?? 0} frames`, hasFlash);
      l("ANALYZE-DETAIL", `colorProfile: ${hasProfile ? "present" : "missing"}`, hasProfile);

      if (hasVocab) {
        const types = new Set<string>();
        for (const shot of style.effectVocabulary) {
          for (const e of shot.effects) types.add(e.type);
        }
        l("ANALYZE-DETAIL", `Effect types extracted: ${[...types].join(", ")}`);
      }

      if (style.structuralAnalysis) {
        const sa = style.structuralAnalysis;
        l("STRUCTURAL", `motionEnergyProfile1s: ${sa.motionEnergyProfile1s.length} buckets`, sa.motionEnergyProfile1s.length > 0);
        l("STRUCTURAL", `shotMotionProfile: ${sa.shotMotionProfile.length} shots`);
        l("STRUCTURAL", `earlyEnergy: ${sa.earlyEnergy.toFixed(3)}, lateEnergy: ${sa.lateEnergy.toFixed(3)}, varianceRatio: ${sa.energyVarianceRatio.toFixed(2)}`);
        if (sa.peakMotionTimestamp !== undefined) {
          l("STRUCTURAL", `peakMotionTimestamp: ${sa.peakMotionTimestamp.toFixed(2)}s`);
        }
      }

      if (style.rhythm?.structure) {
        const rs = style.rhythm.structure;
        l("RHYTHM-SPLIT", `firstHalf: ${rs.firstHalfAvgShotDuration.toFixed(2)}s avg, ${rs.firstHalfCutsPerSecond.toFixed(2)} cuts/s`);
        l("RHYTHM-SPLIT", `secondHalf: ${rs.secondHalfAvgShotDuration.toFixed(2)}s avg, ${rs.secondHalfCutsPerSecond.toFixed(2)} cuts/s`);
        l("RHYTHM-SPLIT", `shortest: ${rs.shortestShotDuration.toFixed(2)}s, longest: ${rs.longestShotDuration.toFixed(2)}s, variance: ${rs.shotDurationVariance.toFixed(4)}`);
        l("RHYTHM-SPLIT", `accelerationRatio: ${rs.accelerationRatio.toFixed(2)}`, rs.accelerationRatio > 1.3);
      }

      if (style.climax) {
        l("CLIMAX", `timestamp: ${style.climax.timestamp.toFixed(2)}s, confidence: ${style.climax.confidence.toFixed(2)}, reason: ${style.climax.reason}`, style.climax.confidence > 0.3);
      }

      if (style.intentMapping?.structure) {
        l("INTENT-V2", `structure: ${style.intentMapping.structure}, energyArc: ${style.intentMapping.energyArc}, pacing: ${style.intentMapping.pacing}`);
      }

      const palettes = style.dominantPalette ?? [];
      const paletteValid = palettes.length > 0 && palettes.every((c: string) => /^#[0-9a-fA-F]{6}$/.test(c));
      l("BADGE", `palette: ${paletteValid ? "PASS" : "WARN"} (${palettes.length} colors)`, paletteValid);

      const hasStructuralSplit = (style.rhythm?.structure?.accelerationRatio ?? 1) > 1.3;
      l("BADGE", `structural split: ${hasStructuralSplit ? "PASS" : "WARN"}`, hasStructuralSplit);

      const hasClimax = (style.climax?.confidence ?? 0) > 0.3;
      l("BADGE", `climax candidate: ${hasClimax ? "PASS" : "WARN"}`, hasClimax);

      const motionNotFlat = (style.structuralAnalysis?.energyVarianceRatio ?? 1) !== 1;
      l("BADGE", `motion profile: ${motionNotFlat ? "PASS" : "WARN"}`, motionNotFlat);

      const pacingInferred = style.intentMapping?.pacing !== undefined;
      l("BADGE", `pacing inferred: ${pacingInferred ? "PASS" : "WARN"}`, pacingInferred);
    } catch (e: any) {
      l("ANALYZE", `Reference analysis FAILED: ${e.message}`, false);
      setRefStep("error");
      return;
    }
    setRefStep("done");

    // ── Step 3: Analyze selected footage segments ──
    setGenStep("running");
    const uniqueFileIds = [...new Set(selectedSegments.map(s => s.fileId))];
    l("ANALYZE", `Analyzing ${selectedSegments.length} segments from ${uniqueFileIds.length} unique files...`);

    let musicId: string | undefined;
    if (musicFile) {
      l("UPLOAD", "Uploading music...");
      try {
        musicId = await uploadFile(musicFile, projectId, "music");
        l("UPLOAD", `Music uploaded: ${musicId}`, true);
      } catch (e: any) {
        l("UPLOAD", `Music upload failed: ${e.message}`, false);
      }
    }

    let analysisResult: any;
    try {
      analysisResult = await apiPost<any>("/api/analyze", { projectId, footageIds: uniqueFileIds, musicId });
      l("ANALYZE", `Footage analysis complete. ${analysisResult.result?.footage?.length ?? 0} clips analyzed`, true);
    } catch (e: any) {
      l("ANALYZE", `Footage analysis FAILED: ${e.message}`, false);
      setGenStep("error");
      return;
    }

    // ── Step 4: Decode intent ──
    l("INTENT", `Decoding prompt: "${prompt.slice(0, 60)}..."`);
    let intent: any;
    try {
      intent = await apiPost<any>("/api/decode-intent", {
        prompt,
        projectId,
        context: { hasReference: true, referenceStyle: style },
      });
      l("INTENT", `Intent decoded: genre=${intent.genre}, pacing=${intent.pacing}, effects=${intent.effectsIntensity}`, true);
    } catch (e: any) {
      l("INTENT", `Intent decode FAILED: ${e.message}`, false);
      setGenStep("error");
      return;
    }

    // ── Step 5: Generate EDL ──
    l("GENERATE", `Generating EDL with ${selectedSegments.length} segments + reference-matched effects...`);
    let generatedEdl: any;
    try {
      generatedEdl = await apiPost<any>("/api/generate-edl", {
        projectId,
        intentId: intent.id || "lab-intent",
        analysisId: analysisResult.analysisId || "lab-analysis",
        analysisData: analysisResult.result || analysisResult,
        referenceStyle: style,
        referenceMode: "strict_replication",
        prompt,
        durationSeconds: intent.durationSeconds,
        selectedSegments,
      });
      setEdl(generatedEdl);
      l("GENERATE", `EDL generated: ${generatedEdl.shots?.length ?? 0} shots, ${(generatedEdl.timeline?.duration ?? 0).toFixed(1)}s`, true);

      const shotsWithEffects = generatedEdl.shots?.filter((s: any) => s.effects?.length > 0).length ?? 0;
      const effectTypes = new Set<string>();
      generatedEdl.shots?.forEach((s: any) => s.effects?.forEach((e: any) => effectTypes.add(e.type)));

      l("EDL-INSPECT", `Shots with effects: ${shotsWithEffects}/${generatedEdl.shots?.length ?? 0}`);
      l("EDL-INSPECT", `Effect types in EDL: ${[...effectTypes].join(", ")}`);
      l("EDL-INSPECT", `color_grade: ${effectTypes.has("color_grade") ? "YES" : "NO"}`);
      l("EDL-INSPECT", `flash effects: ${effectTypes.has("flash_white") || effectTypes.has("impact_flash") ? "YES" : "NO"}`);
    } catch (e: any) {
      l("GENERATE", `EDL generation FAILED: ${e.message}`, false);
      setGenStep("error");
      return;
    }

    // ── Step 6: Style match score ──
    l("SCORE", "Computing style match score...");
    try {
      const scoreResult = await apiPost<any>("/api/style-match-score", { edl: generatedEdl, referenceStyle: style }).catch(() => null);
      if (scoreResult) {
        setScore(scoreResult);
        l("SCORE", `Style match: ${scoreResult.total}/100`, scoreResult.total >= 60);
      } else {
        l("SCORE", "Style match endpoint not available — skipping");
      }
    } catch {
      l("SCORE", "Style match scoring not available on server");
    }
    setGenStep("done");

    // ── Step 7: Export ──
    setExpStep("running");
    l("EXPORT", "Exporting MP4 via server FFmpeg...");
    try {
      const mediaUrls: Record<string, string> = {};
      for (const seg of selectedSegments) {
        if (!mediaUrls[seg.fileId]) {
          mediaUrls[seg.fileId] = `${API}/api/media/${seg.fileId}`;
        }
      }

      const exportRes = await fetch(`${API}/api/export-mp4`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edl: generatedEdl, mediaUrls }),
      });

      if (!exportRes.ok) {
        const errText = await exportRes.text();
        throw new Error(`Export failed: ${exportRes.status} ${errText.slice(0, 200)}`);
      }

      const blob = await exportRes.blob();
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
      setExportSize(blob.size);
      l("EXPORT", `Export complete: ${(blob.size / 1024 / 1024).toFixed(1)}MB`, true);

      const qualityHeader = exportRes.headers.get("X-Quality-Pass");
      if (qualityHeader) {
        l("EXPORT", `Quality gate: ${qualityHeader === "true" ? "PASSED" : "WARNING"}`, qualityHeader === "true");
      }
    } catch (e: any) {
      l("EXPORT", `Export FAILED: ${e.message}`, false);
      setExpStep("error");
      return;
    }
    setExpStep("done");

    l("DONE", "Full pipeline complete.", true);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-lg font-bold font-mono tracking-tight text-orange-400">STYLE REPLICATION LAB</h1>
        <p className="text-xs text-neutral-500 mt-1">Runtime verification harness. Reference + footage + music + prompt &rarr; auto scene detection &rarr; segment selection &rarr; pipeline &rarr; proof.</p>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Inputs */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Inputs</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Reference edit (video)</label>
              <input type="file" accept="video/*" onChange={handleRefFile}
                className="block w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded file:border file:border-neutral-700 file:text-xs file:bg-neutral-900 file:text-neutral-300 hover:file:bg-neutral-800" />
              {refPreview && (
                <video src={refPreview} controls className="mt-2 w-full max-h-48 rounded border border-neutral-800" />
              )}
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Raw footage (video, multiple — auto-detects scenes)</label>
              <input type="file" accept="video/*" multiple onChange={handleFootage}
                className="block w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded file:border file:border-neutral-700 file:text-xs file:bg-neutral-900 file:text-neutral-300 hover:file:bg-neutral-800" />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Music (audio)</label>
              <input type="file" accept="audio/*" onChange={handleMusicFile}
                className="block w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded file:border file:border-neutral-700 file:text-xs file:bg-neutral-900 file:text-neutral-300 hover:file:bg-neutral-800" />
              {musicPreview && (
                <audio src={musicPreview} controls className="mt-2 w-full" />
              )}
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Prompt</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-orange-500 focus:outline-none" />
            </div>
          </div>
        </section>

        {/* Scene Detection + Segment Selection */}
        <section>
          <StepHeader label="Scene Detection & Segment Selection" status={sceneStep} />
          {footageScenes.length === 0 && sceneStep === "idle" && (
            <p className="text-xs text-neutral-600 mt-1">Upload footage above to auto-detect scenes.</p>
          )}
          {footageScenes.map((fs, i) => (
            <SegmentTimeline key={i} footage={fs} fileIndex={i} onToggle={handleToggleSegment} />
          ))}
        </section>

        {/* Run Pipeline */}
        <section>
          <button onClick={runPipeline}
            disabled={footageScenes.length === 0 || sceneStep === "running" || genStep === "running" || expStep === "running"}
            className="px-5 py-2.5 rounded bg-orange-600 text-white text-sm font-semibold hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {genStep === "running" || expStep === "running" ? "Running..." : "Run Full Pipeline"}
          </button>
          {footageScenes.length > 0 && (
            <span className="ml-3 text-xs text-neutral-500">
              {getSelectedSegmentData().length} segments selected
            </span>
          )}
        </section>

        {/* Step 1: Reference Analysis */}
        <section>
          <StepHeader label="1. Reference Analysis" status={refStep} />
          {refStyle && <JsonBlock label="ReferenceStyle JSON" data={refStyle} />}
          {refStyle?.structuralAnalysis && <JsonBlock label="Structural Analysis" data={refStyle.structuralAnalysis} />}
          {refStyle?.rhythm?.structure && <JsonBlock label="Rhythm Structure" data={refStyle.rhythm.structure} />}
          {refStyle?.climax && <JsonBlock label="Climax Candidate" data={refStyle.climax} />}
        </section>

        {/* Step 2: Generation */}
        <section>
          <StepHeader label="2. EDL Generation" status={genStep} />
          {edl && <JsonBlock label="Generated EDL JSON" data={edl} />}
        </section>

        {/* Step 3: Style Score */}
        <section>
          <StepHeader label="3. Style Match Score" status={genStep === "done" ? (score ? "done" : "idle") : "idle"} />
          <ScoreCard score={score} />
        </section>

        {/* Step 4: Export */}
        <section>
          <StepHeader label="4. Export" status={expStep} />
          {exportUrl && (
            <div className="mt-2">
              <a href={exportUrl} download={`style-lab-${Date.now()}.mp4`}
                className="inline-block px-4 py-2 rounded bg-green-700 text-white text-xs font-semibold hover:bg-green-600 transition-colors">
                Download MP4 ({exportSize ? `${(exportSize / 1024 / 1024).toFixed(1)}MB` : "?"})
              </a>
              <video src={exportUrl} controls className="mt-3 w-full max-h-96 rounded border border-neutral-800" />
            </div>
          )}
        </section>

        {/* Logs */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-1">Pipeline Logs</h2>
          <LogPanel logs={logs} />
        </section>
      </div>
    </div>
  );
}
