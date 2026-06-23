// Walks the EDL post-generation, finds shots that need AI specialist passes
// (subject isolation, depth, face tracking), calls the service, attaches the
// resulting asset URLs back to the EDL for the browser renderer to composite.

import type { Env } from "../types/env";
import { MonetAIServicesClient } from "./ai-services-client";

interface ShotAIEnrichment {
  maskUrl?: string;
  depthUrl?: string;
  faceTrackUrl?: string;
}

const SAM_EFFECT_KINDS = new Set([
  "subject_isolation", "isolate_subject", "bg_dim", "bg_blur", "bg_replace",
]);
const DEPTH_EFFECT_KINDS = new Set([
  "depth_parallax", "atmospheric_fog", "depth_defocus", "text_behind_subject",
]);
const FACE_EFFECT_KINDS = new Set([
  "tracked_caption", "face_follow", "tracked_text",
]);

export async function enrichEdlWithAI(
  edl: any,
  env: Env,
  options: { tier: "free" | "creator" | "pro"; clipUrlResolver: (clipId: string) => string },
): Promise<{ edl: any; enrichmentSummary: any }> {
  // Pro tier only — these are expensive
  if (options.tier !== "pro") {
    return { edl, enrichmentSummary: { skipped: true, reason: "tier_not_pro" } };
  }

  const client = new MonetAIServicesClient(env);
  if (!client.isEnabled()) {
    return { edl, enrichmentSummary: { skipped: true, reason: "service_not_configured" } };
  }

  // Group shots by clipId so we run AI specialists once per unique clip
  const shotsByClip = new Map<string, Set<string>>(); // clipId -> set of effect kinds
  for (const shot of edl.shots ?? []) {
    const clipId = shot.source?.clipId;
    if (!clipId) continue;
    const effects = (shot.effects ?? []).map((e: any) => (e.type ?? e.kind ?? "").toLowerCase());

    const kinds = shotsByClip.get(clipId) ?? new Set<string>();
    for (const k of effects) {
      if (SAM_EFFECT_KINDS.has(k) || DEPTH_EFFECT_KINDS.has(k) || FACE_EFFECT_KINDS.has(k)) {
        kinds.add(k);
      }
    }
    if (kinds.size > 0) shotsByClip.set(clipId, kinds);
  }

  // Derive a genre hint for parameter tuning
  const genreHint =
    edl.globalEffects?.colorGrade ??
    edl.meta?.styleDNA ??
    (edl.meta?.pillarsApplied?.brutalistImpact > 0.6
      ? "spiderverse"
      : edl.meta?.pillarsApplied?.legacyMontage > 0.6
      ? "documentary"
      : "default");

  const enrichmentsByClip = new Map<string, ShotAIEnrichment>();
  const summary: any = { processed: 0, cached: 0, errors: 0, perKind: {} as any };

  for (const [clipId, kinds] of shotsByClip.entries()) {
    const enrichment: ShotAIEnrichment = {};
    const videoUrl = options.clipUrlResolver(clipId);

    // Subject isolation
    const needsSAM = [...kinds].some((k) => SAM_EFFECT_KINDS.has(k));
    if (needsSAM) {
      try {
        const result = await client.isolateSubject(videoUrl, {
          genre: genreHint,
          autoDetect: true,
          edgeSoftness: 0.3,
        });
        if (result.status === "completed" && result.maskVideoUrl) {
          enrichment.maskUrl = result.maskVideoUrl;
          summary.processed++;
          if (result.cacheStatus === "hit") summary.cached++;
          summary.perKind.subject_isolation = (summary.perKind.subject_isolation ?? 0) + 1;
        }
      } catch (e: any) {
        console.warn(`[edl-ai-enrich] SAM failed for ${clipId}:`, e.message);
        summary.errors++;
      }
    }

    // Depth
    const needsDepth = [...kinds].some((k) => DEPTH_EFFECT_KINDS.has(k));
    if (needsDepth) {
      try {
        const result = await client.extractDepth(videoUrl, { genre: genreHint });
        if (result.status === "completed" && result.depthMapUrl) {
          enrichment.depthUrl = result.depthMapUrl;
          summary.processed++;
          if (result.cacheStatus === "hit") summary.cached++;
          summary.perKind.depth = (summary.perKind.depth ?? 0) + 1;
        }
      } catch (e: any) {
        console.warn(`[edl-ai-enrich] depth failed for ${clipId}:`, e.message);
        summary.errors++;
      }
    }

    // Face tracking
    const needsFace = [...kinds].some((k) => FACE_EFFECT_KINDS.has(k));
    if (needsFace) {
      try {
        const result = await client.trackFace(videoUrl, { genre: genreHint });
        if (result.status === "completed" && result.trackingDataUrl) {
          enrichment.faceTrackUrl = result.trackingDataUrl;
          summary.processed++;
          if (result.cacheStatus === "hit") summary.cached++;
          summary.perKind.face = (summary.perKind.face ?? 0) + 1;
        }
      } catch (e: any) {
        console.warn(`[edl-ai-enrich] face tracking failed for ${clipId}:`, e.message);
        summary.errors++;
      }
    }

    enrichmentsByClip.set(clipId, enrichment);
  }

  // Attach asset URLs to each shot's effect params so the browser renderer can pick them up
  const enrichedEdl = structuredClone(edl);
  for (const shot of enrichedEdl.shots ?? []) {
    const clipId = shot.source?.clipId;
    if (!clipId) continue;
    const e = enrichmentsByClip.get(clipId);
    if (!e) continue;

    for (const eff of shot.effects ?? []) {
      const kind = (eff.type ?? eff.kind ?? "").toLowerCase();
      eff.params = eff.params ?? {};
      if (SAM_EFFECT_KINDS.has(kind) && e.maskUrl) eff.params.maskUrl = e.maskUrl;
      if (DEPTH_EFFECT_KINDS.has(kind) && e.depthUrl) eff.params.depthUrl = e.depthUrl;
      if (FACE_EFFECT_KINDS.has(kind) && e.faceTrackUrl) eff.params.faceTrackUrl = e.faceTrackUrl;
    }
  }

  enrichedEdl.meta = enrichedEdl.meta ?? {};
  enrichedEdl.meta.aiEnrichment = summary;

  return { edl: enrichedEdl, enrichmentSummary: summary };
}
