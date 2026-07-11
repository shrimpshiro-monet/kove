/**
 * Capability Registry — runtime registry + manifest builder.
 *
 * Registers every capability at module load. Provides lookup, search,
 * and manifest generation for Nemotron system prompt injection.
 *
 * Zero circular imports: capability files must not import this registry.
 *
 * Accepts both Capability<T> (Zod-validated) and LegacyCapability (doc-string params).
 * Legacy caps emit a console.warn on registration. Remove LegacyCapability support
 * after all 38 alpha caps are migrated to Zod schemas.
 */

import type { Capability, LegacyCapability, CapabilityCategory, CapabilityStatus } from "./types";

// ============================================================================
// INTERNAL STORE
// ============================================================================

type RegisteredCapability = Capability<any> | LegacyCapability;

const capabilities = new Map<string, RegisteredCapability>();
const legacyIds = new Set<string>();

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerCapability(cap: Capability<any> | LegacyCapability): void {
  if (capabilities.has(cap.id)) {
    console.warn(`[registry] duplicate capability id: ${cap.id} — overwriting`);
  }

  // Detect legacy capabilities (doc-string params instead of Zod schema)
  const isLegacy = typeof cap.params === "object" && cap.params !== null &&
    !("parse" in cap.params) && !("safeParse" in cap.params);

  if (isLegacy) {
    legacyIds.add(cap.id);
    // Only warn once per id to avoid noise during module load
    if (!capabilities.has(cap.id)) {
      console.warn(`[registry] ${cap.id} uses legacy params — migrate to Zod schema`);
    }
  }

  capabilities.set(cap.id, cap);
}

export function registerAll(caps: Array<Capability<any> | LegacyCapability>): void {
  for (const cap of caps) {
    registerCapability(cap);
  }
}

// ============================================================================
// LOOKUP
// ============================================================================

export function lookupCapability(id: string): RegisteredCapability | undefined {
  return capabilities.get(id);
}

export function lookupAlphaCapability(id: string): Capability<any> | undefined {
  const cap = capabilities.get(id);
  if (cap && cap.status === "alpha" && !legacyIds.has(cap.id)) {
    return cap as Capability<any>;
  }
  return undefined;
}

export function searchByTrigger(query: string): RegisteredCapability[] {
  const lower = query.toLowerCase();
  const results: RegisteredCapability[] = [];

  for (const cap of capabilities.values()) {
    for (const phrase of cap.triggerPhrases) {
      if (lower.includes(phrase.toLowerCase()) || phrase.toLowerCase().includes(lower)) {
        results.push(cap);
        break;
      }
    }
  }

  return results;
}

export function getByCategory(category: CapabilityCategory): RegisteredCapability[] {
  return Array.from(capabilities.values()).filter((c) => c.category === category);
}

export function getByStatus(status: CapabilityStatus): RegisteredCapability[] {
  return Array.from(capabilities.values()).filter((c) => c.status === status);
}

export function getLegacyIds(): string[] {
  return Array.from(legacyIds);
}

// ============================================================================
// MANIFEST BUILDER
// ============================================================================

export interface ManifestOptions {
  /** Minimum status to include. "alpha" = only alpha, "beta" = alpha + beta, "planned" = all */
  minStatus: CapabilityStatus;
}

const STATUS_ORDER: Record<CapabilityStatus, number> = {
  alpha: 0,
  beta: 1,
  planned: 2,
};

function statusIncludes(status: CapabilityStatus, minStatus: CapabilityStatus): boolean {
  return STATUS_ORDER[status] <= STATUS_ORDER[minStatus];
}

const CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  edit: "Edit",
  effects: "Effects",
  overlays: "Overlays",
  audio: "Audio",
  transitions: "Transitions",
  camera: "Camera",
  composition: "Composition",
};

/**
 * Build a Nemotron-readable manifest string listing capabilities filtered by status.
 * Groups by category. Each entry includes id, description, and trigger phrases.
 */
export function buildManifest(opts: ManifestOptions): string {
  const filtered = Array.from(capabilities.values()).filter((c) =>
    statusIncludes(c.status, opts.minStatus),
  );

  const grouped = new Map<CapabilityCategory, RegisteredCapability[]>();
  for (const cap of filtered) {
    const existing = grouped.get(cap.category) ?? [];
    existing.push(cap);
    grouped.set(cap.category, existing);
  }

  const lines: string[] = [
    `# Kove Editing Capabilities`,
    `Status filter: ${opts.minStatus}+ (${filtered.length} capabilities)`,
    ``,
  ];

  const categoryOrder: CapabilityCategory[] = [
    "edit", "effects", "overlays", "audio", "transitions", "camera", "composition",
  ];

  for (const cat of categoryOrder) {
    const caps = grouped.get(cat);
    if (!caps || caps.length === 0) continue;

    lines.push(`## ${CATEGORY_LABELS[cat]}`);
    lines.push(``);

    for (const cap of caps) {
      const statusTag = cap.status === "alpha" ? "✓" : cap.status === "beta" ? "◐" : "○";
      const legacyTag = legacyIds.has(cap.id) ? " ⚠️legacy" : "";
      lines.push(`- **${cap.id}** ${statusTag}${legacyTag} — ${cap.description}`);
      if (cap.triggerPhrases.length > 0) {
        lines.push(`  Triggers: ${cap.triggerPhrases.slice(0, 3).join(", ")}`);
      }
    }

    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`✓ = available now  ◐ = coming soon  ○ = planned  ⚠️legacy = needs Zod migration`);
  lines.push(`Only use ✓ capabilities. For ◐/○, tell the user it's coming soon.`);

  return lines.join("\n");
}

/**
 * Build a JSON manifest for export to scripts/capabilities.json
 */
export function buildJsonManifest(opts: ManifestOptions): {
  generatedAt: string;
  capabilities: Array<{
    id: string;
    category: CapabilityCategory;
    status: CapabilityStatus;
    description: string;
    triggerPhrases: string[];
    isLegacy: boolean;
  }>;
} {
  const filtered = Array.from(capabilities.values()).filter((c) =>
    statusIncludes(c.status, opts.minStatus),
  );

  return {
    generatedAt: new Date().toISOString(),
    capabilities: filtered.map((c) => ({
      id: c.id,
      category: c.category,
      status: c.status,
      description: c.description,
      triggerPhrases: c.triggerPhrases,
      isLegacy: legacyIds.has(c.id),
    })),
  };
}

// ============================================================================
// STATS
// ============================================================================

export function getStats(): {
  total: number;
  alpha: number;
  beta: number;
  planned: number;
  legacy: number;
  migrated: number;
} {
  const all = Array.from(capabilities.values());
  return {
    total: all.length,
    alpha: all.filter((c) => c.status === "alpha").length,
    beta: all.filter((c) => c.status === "beta").length,
    planned: all.filter((c) => c.status === "planned").length,
    legacy: legacyIds.size,
    migrated: all.length - legacyIds.size,
  };
}
