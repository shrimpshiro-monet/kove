import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatThreads, useStudioProjects } from "@/lib/storage";
import { fetchStudioProject } from "@/lib/api-client";
import type { MonetEDL } from "@/server/types/edl";
import { convertMonetEDLToOpenReelProject } from "@/lib/openreel/edl-to-openreel";

export const Route = createFileRoute("/studio_/$projectId")({
  component: StudioPage,
});

function StudioPage() {
  const { projectId } = Route.useParams();
  const navigate = Route.useNavigate();
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [remoteEDL, setRemoteEDL] = useState<MonetEDL | null>(null);
  const [remoteProjectName, setRemoteProjectName] = useState<string | null>(null);
  const [remoteResolved, setRemoteResolved] = useState(false);
  const [remoteLookupError, setRemoteLookupError] = useState<string | null>(null);
  const { projects } = useStudioProjects();
  const { threads } = useChatThreads();

  const project = projects.find((p) => p.id === projectId);

  // Fallback: if project mapping is missing, treat the path ID as a thread ID,
  // or use ?threadId=... when present.
  const fallbackThreadId = useMemo(() => {
    if (typeof window === "undefined") return projectId;
    const searchThreadId = new URLSearchParams(window.location.search).get("threadId");
    return searchThreadId || projectId;
  }, [projectId]);

  const sourceThread = project?.sourceThreadId
    ? threads.find((t) => t.id === project.sourceThreadId)
    : threads.find((t) => t.id === fallbackThreadId);

  const activeEDL =
    (project?.latestEdl as MonetEDL | undefined) ??
    (sourceThread?.latestEdl as MonetEDL | undefined) ??
    remoteEDL ??
    undefined;

  const projectName = project?.name ?? sourceThread?.title ?? remoteProjectName ?? "Monet Project";

  useEffect(() => {
    const hasLocal = !!project?.latestEdl || !!sourceThread?.latestEdl;
    if (hasLocal) {
      setRemoteResolved(true);
      return;
    }

    const controller = new AbortController();
    setRemoteResolved(false);

    fetchStudioProject(projectId, fallbackThreadId, controller.signal)
      .then((res) => {
        if (!res.success || !res.edl) {
          setRemoteLookupError(res.error ?? "Studio timeline lookup failed");
          return;
        }
        setRemoteEDL(res.edl);
        setRemoteProjectName(res.projectName ?? null);
        setRemoteLookupError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRemoteLookupError(err instanceof Error ? err.message : "Studio remote lookup failed");
        console.warn("Studio remote lookup failed:", err);
      })
      .finally(() => {
        setRemoteResolved(true);
      });

    return () => controller.abort();
  }, [projectId, fallbackThreadId, project?.latestEdl, sourceThread?.latestEdl]);

  const editorUrl = useMemo(() => {
    const base = import.meta.env.VITE_OPENREEL_EDITOR_URL || "http://localhost:5173";
    return `${base}?source=monet&projectId=${encodeURIComponent(projectId)}#/editor`;
  }, [projectId]);

  const editorOrigin = useMemo(() => {
    try {
      return new URL(editorUrl).origin;
    } catch {
      return "*";
    }
  }, [editorUrl]);

  const mediaApiBase = useMemo(() => {
    const configured = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
    if (configured) return configured;
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);

  const buildMediaUrl = (mediaId: string) =>
    mediaApiBase
      ? `${mediaApiBase}/api/media/${encodeURIComponent(mediaId)}`
      : `/api/media/${encodeURIComponent(mediaId)}`;

  const mediaUrlMap = useMemo(() => {
    const map = new Map<string, string>();

    // Build attachment aliases so EDL clip IDs can resolve to persisted R2 IDs.
    // In chat mode we support these aliases; Studio needs the same resiliency.
    const attachmentAlias = new Map<string, string>();
    const attachments = sourceThread?.messages.flatMap((m) => m.attachments ?? []) ?? [];
    for (const attachment of attachments) {
      const canonicalId = attachment.r2FileId ?? attachment.id;
      if (!canonicalId) continue;
      const canonicalUrl = buildMediaUrl(canonicalId);

      // Canonical key.
      attachmentAlias.set(canonicalId, canonicalUrl);

      // Legacy/local keys used by chat uploader before R2 IDs were available.
      if (attachment.id && attachment.id !== canonicalId) {
        attachmentAlias.set(attachment.id, canonicalUrl);
      }
      if (attachment.name) {
        attachmentAlias.set(`dev-${attachment.name}`, canonicalUrl);
      }
    }

    // Primary: map directly from EDL clip IDs and music source ID.
    if (activeEDL) {
      for (const shot of activeEDL.shots) {
        if (!map.has(shot.source.clipId)) {
          const resolved = attachmentAlias.get(shot.source.clipId) ?? buildMediaUrl(shot.source.clipId);
          map.set(shot.source.clipId, resolved);
        }
      }

      const musicId = activeEDL.music?.sourceId;
      if (musicId && !map.has(musicId)) {
        const resolved = attachmentAlias.get(musicId) ?? buildMediaUrl(musicId);
        map.set(musicId, resolved);
      }
    }

    // Secondary: include thread attachments as an additional lookup source.
    for (const attachment of attachments) {
      const mediaId = attachment.r2FileId ?? attachment.id;
      if (!mediaId) continue;
      if (!map.has(mediaId)) {
        map.set(mediaId, buildMediaUrl(mediaId));
      }
    }
    return map;
  }, [activeEDL, buildMediaUrl, sourceThread]);

  const openReelProject = useMemo(() => {
    if (!activeEDL) return null;
    return convertMonetEDLToOpenReelProject(activeEDL, {
      projectId,
      projectName,
      mediaUrlMap,
    });
  }, [activeEDL, projectName, projectId, mediaUrlMap]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (editorOrigin !== "*" && event.origin !== editorOrigin) return;
      if (!event.data || typeof event.data !== "object") return;
      const payload = event.data as {
        type?: string;
        destination?: "chat" | "dashboard";
      };

      if (payload.type === "monet-navigate") {
        if (payload.destination === "chat") {
          if (sourceThread?.id) {
            navigate({
              to: "/chat/$threadId",
              params: { threadId: sourceThread.id },
            });
          } else {
            navigate({ to: "/chat" });
          }
          return;
        }

        if (payload.destination === "dashboard") {
          navigate({ to: "/" });
          return;
        }
      }

      if (payload.type === "monet-editor-ready") {
        setEditorReady(true);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editorOrigin, navigate, sourceThread?.id]);

  useEffect(() => {
    if (!loaded || !editorReady || !openReelProject) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;

    const message = {
      type: "monet-load-project",
      project: openReelProject,
      meta: {
        projectId,
        from: "monet",
      },
    };

    target.postMessage(message, editorOrigin);
  }, [loaded, editorReady, openReelProject, projectId, editorOrigin]);

  return (
    <div className="h-screen w-screen bg-background">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-muted-foreground text-sm">
          Loading advanced studio...
        </div>
      )}

      {loaded && editorReady && remoteResolved && !openReelProject && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center p-6">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur">
            <p className="text-sm font-semibold text-foreground">No timeline found for this Studio link</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This URL opened the editor, but no project/thread EDL is available in this browser origin's local storage.
            </p>
            {remoteLookupError && (
              <p className="mt-1 text-xs text-amber-500">Backend lookup: {remoteLookupError}</p>
            )}
            <div className="mt-3 text-xs text-muted-foreground">
              <p>Project ID: {projectId}</p>
              <p>Resolved Thread ID: {fallbackThreadId}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                onClick={() => navigate({ to: "/studio" })}
              >
                Open Available Studio Project
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                onClick={() => navigate({ to: "/chat" })}
              >
                Back to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="Monet Advanced Studio"
        src={editorUrl}
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
