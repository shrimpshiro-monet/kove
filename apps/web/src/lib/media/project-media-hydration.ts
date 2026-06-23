import type { MonetEDL, Shot } from "@monet/edl";

export type UploadedFile = {
  id: string;
  type: "footage" | "music" | "reference";
  file: File;
  preview?: string;
  r2FileId?: string;
};

export type ProjectLike = {
  id: string;
  mediaLibrary?: {
    items?: Array<{
      id: string;
      name?: string;
      type?: string;
      url?: string;
      src?: string;
      path?: string;
      mimeType?: string;
      duration?: number;
      width?: number;
      height?: number;
      metadata?: Record<string, unknown>;
    }>;
  };
};

export function getEDLShots(edl: any): any[] {
  if (!edl) return [];
  if (Array.isArray(edl.shots)) return edl.shots;
  if (Array.isArray(edl.timeline?.shots)) return edl.timeline.shots;
  return [];
}

export function getShotClipId(shot: any): string | null {
  if (!shot) return null;
  return shot.source?.clipId || shot.clipId || shot.sourceClipId || null;
}

export function guessMediaTypeFromNameOrUrl(value: string): "video" | "audio" | "image" {
  const lower = value.toLowerCase();

  if (
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".flac")
  ) {
    return "audio";
  }

  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  ) {
    return "image";
  }

  return "video";
}

export function createVideoMediaItemFromClipId(clipId: string) {
  const url = `/api/media/${encodeURIComponent(clipId)}_proxy`;

  return {
    id: clipId,
    name: clipId,
    type: "video",
    url,
    src: url,
    path: url,
    mimeType: "video/mp4",
    metadata: {
      source: "edl-auto-hydrated",
      clipId,
      canonicalAssetId: clipId,
    },
  };
}

export function hydrateProjectMediaFromEDL<TProject extends ProjectLike>(
  project: TProject,
  edl: any
): TProject {
  const shots = getEDLShots(edl);

  const existingItems = project.mediaLibrary?.items ?? [];
  const existingIds = new Set(existingItems.map((item) => item.id));
  const existingAliases = new Set(
    existingItems.flatMap((item: any) => [
      ...(item.metadata?.aliases ?? []),
      ...(item.aliases ?? []),
      item.name,
    ].filter(Boolean))
  );

  const missingClipIds = Array.from(
    new Set(
      shots
        .map(getShotClipId)
        .filter((clipId): clipId is string => Boolean(clipId))
    )
  ).filter((clipId) => !existingIds.has(clipId) && !existingAliases.has(clipId));

  if (missingClipIds.length === 0) {
    return project;
  }

  console.warn("[hydration] Hydrating missing EDL media into project library", {
    missingClipIds,
  });

  const hydratedItems = missingClipIds.map(createVideoMediaItemFromClipId);

  return {
    ...project,
    mediaLibrary: {
      ...(project.mediaLibrary ?? {}),
      items: [...existingItems, ...hydratedItems],
    },
  };
}

export function resolveMediaItem(mediaItems: any[], clipId: string): any | null {
  if (!clipId) return null;
  const direct = mediaItems.find((item) => item.id === clipId);
  if (direct) return direct;

  const byAlias = mediaItems.find((item) => {
    const aliases = item.metadata?.aliases ?? item.aliases ?? [];
    return aliases.includes(clipId);
  });
  if (byAlias) return byAlias;

  const byName = mediaItems.find((item) => item.name === clipId);
  if (byName) return byName;

  return null;
}

export function getCanonicalUploadedFileId(file: UploadedFile): string {
  return file.r2FileId || file.id;
}

export function getUploadedFileAliases(file: UploadedFile): string[] {
  const canonicalId = getCanonicalUploadedFileId(file);

  return Array.from(
    new Set(
      [
        file.r2FileId,
        file.id,
        `dev-${file.file.name}`,
        file.file.name,
      ].filter((id): id is string => Boolean(id) && id !== canonicalId)
    )
  );
}

function buildUploadedFileMediaUrl(
  file: UploadedFile,
  buildMediaUrl: (mediaId: string) => string
): string {
  if (file.preview) return file.preview;

  if (file.type === "footage" && file.r2FileId) {
    return buildMediaUrl(`${file.r2FileId}_proxy`);
  }

  return buildMediaUrl(file.r2FileId ?? file.id);
}

export interface SyncUploadedFilesAndEDLToProjectInput {
  project: any;
  uploadedFiles: UploadedFile[];
  edl: any;
  buildMediaUrl: (mediaId: string) => string;
}

export function syncUploadedFilesAndEDLToProject({
  project,
  uploadedFiles,
  edl,
  buildMediaUrl,
}: SyncUploadedFilesAndEDLToProjectInput): any {
  const items = project.mediaLibrary?.items ? [...project.mediaLibrary.items] : [];

  for (const file of uploadedFiles) {
    const canonicalId = getCanonicalUploadedFileId(file);
    const aliases = getUploadedFileAliases(file);

    const existingIndex = items.findIndex((item: any) => item.id === canonicalId);
    const pathUrl = buildUploadedFileMediaUrl(file, buildMediaUrl);

    const mediaItem = {
      id: canonicalId,
      name: file.file.name,
      type: file.type === "music" ? "audio" : "video",
      duration: 60, // Fallback duration
      width: file.type === "music" ? undefined : 1920,
      height: file.type === "music" ? undefined : 1080,
      mimeType: file.file.type || (file.type === "music" ? "audio/mpeg" : "video/mp4"),
      url: pathUrl,
      src: pathUrl,
      path: pathUrl,
      metadata: {
        aliases,
        source: "chat-auto-registered",
        canonicalAssetId: canonicalId,
        originalFileName: file.file.name,
        uploadKind: file.type,
      },
    };

    if (existingIndex !== -1) {
      items[existingIndex] = {
        ...items[existingIndex],
        ...mediaItem,
        metadata: {
          ...(items[existingIndex].metadata ?? {}),
          ...mediaItem.metadata,
          aliases: Array.from(new Set([
            ...(items[existingIndex].metadata?.aliases ?? []),
            ...aliases
          ]))
        }
      };
    } else {
      items.push(mediaItem);
    }
  }

  const updatedProject = {
    ...project,
    mediaLibrary: {
      ...(project.mediaLibrary ?? {}),
      items,
    },
  };

  return hydrateProjectMediaFromEDL(updatedProject, edl);
}
