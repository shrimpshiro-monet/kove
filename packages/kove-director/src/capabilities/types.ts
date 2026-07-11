/**
 * Capability types for the Kove Skill Registry.
 *
 * Every editing feature that exists as functional code gets a Capability entry.
 * The registry uses these types to build manifests for Nemotron and to gate
 * which capabilities the compiler can emit.
 *
 * Capability<TParams> — production type with Zod schema validation.
 * LegacyCapability — compatibility shim for un-migrated capability files.
 *   Remove after all alpha caps are migrated to Zod schemas.
 */

import { z } from "zod";
import type { OpenReelAction } from "@monet/openreel-adapter";

// ============================================================================
// STATUS
// ============================================================================

/**
 * - alpha: Has a Kove Director action verb + wired end-to-end
 * - beta: Engine and/or UI exists but no action verb, ready to expose
 * - planned: Placeholder or partial code, not fully built
 */
export type CapabilityStatus = "alpha" | "beta" | "planned";

// ============================================================================
// CATEGORY
// ============================================================================

export type CapabilityCategory =
  | "edit"
  | "effects"
  | "overlays"
  | "audio"
  | "transitions"
  | "camera"
  | "composition";

// ============================================================================
// CONTEXT (passed to compile at runtime)
// ============================================================================

export interface CapabilityContext {
  /** Total timeline duration in seconds */
  duration?: number;
  /** IDs of currently selected clips (for scoped edits) */
  selectedClipIds?: string[];
  /** Target track ID (defaults to "video-main") */
  trackId?: string;
  /** Current clip details for scoped operations */
  currentClip?: {
    id: string;
    mediaId: string;
    duration: number;
    inPoint: number;
    outPoint: number;
    startTime: number;
  };
}

// ============================================================================
// CAPABILITY (production — Zod-validated)
// ============================================================================

export interface Capability<TParams = unknown> {
  /** Unique kebab-case identifier (e.g., "split-clip", "crossfade") */
  id: string;
  /** Feature category */
  category: CapabilityCategory;
  /** Current status */
  status: CapabilityStatus;
  /** Semver version of this capability definition */
  version: string;
  /** Short semantic description Nemotron reads (1-2 sentences) */
  description: string;
  /** Natural language phrases that should trigger this capability */
  triggerPhrases: string[];
  /**
   * Input validation schema.
   * Production: Zod schema (z.object({...})).
   * Legacy: doc-string Record<string, string> (migrate to Zod).
   */
  params: z.ZodType<TParams> | Record<string, string>;
  /** Compile input + context into OpenReel actions */
  compile: (input: TParams, context?: CapabilityContext) => unknown[];
  /** Example input/output pairs for few-shot prompting */
  examples: Array<{ input: TParams | string; output: unknown[] }>;
}

// ============================================================================
// LEGACY CAPABILITY (compatibility shim — remove after migration)
// ============================================================================

/**
 * Temporary type that allows existing capability files with doc-string params
 * and untyped compile functions to still register. After all 38 alpha caps
 * are migrated to Zod schemas, delete this type and update registerCapability.
 */
export type LegacyCapability = Omit<Capability, "params" | "compile" | "examples"> & {
  params: Record<string, string>;
  compile: (input: Record<string, unknown>, context?: CapabilityContext) => unknown[];
  examples: Array<{ input: string; output: unknown[] }>;
};
