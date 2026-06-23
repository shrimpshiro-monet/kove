// src/lib/style/upload-reference.ts
import { analyzeReference, type StyleProfile } from "./reference-analyzer";
import { uploadFileDirect } from "../api-client";

export async function uploadAndAnalyzeReference(file: File, threadId: string): Promise<{
  mediaId: string;
  profile: StyleProfile;
}> {
  // 1. Upload to server (existing endpoint)
  const res = await uploadFileDirect(file, threadId, "reference");
  if (!res.success || !res.fileId) {
    throw new Error(res.error || "Reference upload failed");
  }
  const mediaId = res.fileId;

  // 2. Create a hidden video element to analyze
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;

  document.body.appendChild(video);
  try {
    // Wait for video to be loadable
    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onError = () => reject(new Error("video failed to load"));
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const profile = await analyzeReference(video);
    profile.referenceMediaId = mediaId;
    return { mediaId, profile };
  } finally {
    URL.revokeObjectURL(video.src);
    video.remove();
  }
}
