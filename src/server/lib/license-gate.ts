export type AllowedLicense =
  | "MIT"
  | "Apache-2.0"
  | "LGPL-2.1-or-later"
  | "LGPL-3.0-or-later"
  | "GPL-2.0"
  | "GPL-3.0"
  | "GPL-2.0-or-later"
  | "GPL-3.0-or-later";

export type ComponentStatus =
  | "approved"
  | "blocked"
  | "blocked-until-pinned"
  | "blocked-policy-exception-required";

export type DownloadPolicy =
  | "bundled"
  | "runtime-download-approved"
  | "system-installed-approved"
  | "blocked-until-pinned"
  | "blocked";

export interface LicenseGateError {
  code:
    | "INVALID_MANIFEST"
    | "COMPONENT_NOT_FOUND"
    | "COMPONENT_BLOCKED"
    | "LICENSE_BLOCKED"
    | "COMMERCIAL_USE_BLOCKED"
    | "ARTIFACT_NOT_PINNED"
    | "DOWNLOAD_POLICY_BLOCKED"
    | "CONSTRAINT_VIOLATION";
  message: string;
  componentId?: string;
  details?: Record<string, unknown>;
}

export interface LicenseGateResult<TData = unknown> {
  success: boolean;
  error?: LicenseGateError;
  data?: TData;
}

export interface LicenseManifest {
  schemaVersion: "1.0.0";
  policy: {
    allowedLicenses: AllowedLicense[];
    blockedLicenses: string[];
    failClosed: true;
    allowIsc: false;
  };
  components: LicenseComponent[];
}

export interface LicenseComponent {
  id: string;
  name: string;
  category:
    | "render"
    | "orchestration"
    | "api"
    | "audio"
    | "vision"
    | "depth"
    | "motion"
    | "codec"
    | "model"
    | "library";
  license: string;
  commercialUse: boolean;
  status: ComponentStatus;
  source: {
    type: "github" | "pypi" | "npm" | "huggingface" | "system" | "internal";
    locator: string;
    version?: string;
    commit?: string;
  };
  downloadPolicy: DownloadPolicy;
  artifacts: LicenseArtifact[];
  constraints: string[];
  blockedVariants: BlockedVariant[];
  notes?: string;
}

export interface LicenseArtifact {
  type:
    | "binary"
    | "source"
    | "model-weight"
    | "package"
    | "checkpoint"
    | "container-image";
  name: string;
  sha256?: string;
  required?: boolean;
}

export interface BlockedVariant {
  name: string;
  reason: string;
  license?: string;
}

const STRICT_ALLOWED_LICENSES = new Set<string>([
  "MIT",
  "Apache-2.0",
  "LGPL-2.1-or-later",
  "LGPL-3.0-or-later",
  "GPL-2.0",
  "GPL-3.0",
  "GPL-2.0-or-later",
  "GPL-3.0-or-later",
]);

const ALWAYS_BLOCKED_LICENSE_PATTERNS = [
  /^AGPL/i,
  /^SSPL/i,
  /CC-BY-NC/i,
  /Non-Commercial/i,
  /Proprietary/i,
  /Unknown/i,
];

const VALID_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readBoolean(value: Record<string, unknown>, key: string): boolean | null {
  const candidate = value[key];
  return typeof candidate === "boolean" ? candidate : null;
}

function readArray(value: Record<string, unknown>, key: string): unknown[] | null {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : null;
}

function makeError<T = never>(
  code: LicenseGateError["code"],
  message: string,
  componentId?: string,
  details?: Record<string, unknown>
): LicenseGateResult<T> {
  return {
    success: false,
    error: {
      code,
      message,
      componentId,
      details,
    },
  };
}

function isAllowedLicense(license: string, manifest: LicenseManifest): boolean {
  if (manifest.policy.allowedLicenses.includes(license as AllowedLicense)) {
    return true;
  }

  if (license === "ISC" && (manifest.policy.allowIsc as boolean) === true) {
    return true;
  }

  return STRICT_ALLOWED_LICENSES.has(license);
}

function isBlockedLicense(license: string, manifest: LicenseManifest): boolean {
  if (manifest.policy.blockedLicenses.includes(license)) {
    return true;
  }

  // GPL is only blocked if the manifest explicitly blocks it OR if it's not compliant with SaaS loophole
  if ((license.startsWith("GPL") || license.includes("GPL")) && manifest.policy.blockedLicenses.includes(license)) {
    return true;
  }

  return ALWAYS_BLOCKED_LICENSE_PATTERNS.some((pattern) => pattern.test(license));
}

function validateArtifactPins(component: LicenseComponent): LicenseGateResult {
  const requiresPins =
    component.downloadPolicy === "bundled" ||
    component.downloadPolicy === "runtime-download-approved";

  if (!requiresPins) {
    return { success: true };
  }

  for (const artifact of component.artifacts) {
    const pinRequired =
      artifact.type === "model-weight" ||
      artifact.type === "checkpoint" ||
      artifact.type === "container-image";

    if (!pinRequired) {
      continue;
    }

    if (!artifact.sha256 || !VALID_SHA256_PATTERN.test(artifact.sha256)) {
      return makeError(
        "ARTIFACT_NOT_PINNED",
        `Artifact "${artifact.name}" for component "${component.id}" must have a valid sha256 pin.`,
        component.id,
        {
          artifactName: artifact.name,
          artifactType: artifact.type,
          downloadPolicy: component.downloadPolicy,
        }
      );
    }
  }

  return { success: true };
}

function validateComponent(component: LicenseComponent, manifest: LicenseManifest): LicenseGateResult {
  if (component.status !== "approved") {
    return makeError(
      "COMPONENT_BLOCKED",
      `Component "${component.id}" is not approved. Current status: ${component.status}.`,
      component.id,
      {
        status: component.status,
      }
    );
  }

  if (component.downloadPolicy === "blocked" || component.downloadPolicy === "blocked-until-pinned") {
    return makeError(
      "DOWNLOAD_POLICY_BLOCKED",
      `Component "${component.id}" has blocked download policy: ${component.downloadPolicy}.`,
      component.id,
      {
        downloadPolicy: component.downloadPolicy,
      }
    );
  }

  if (!component.commercialUse) {
    return makeError(
      "COMMERCIAL_USE_BLOCKED",
      `Component "${component.id}" is not approved for commercial use.`,
      component.id
    );
  }

  if (isBlockedLicense(component.license, manifest)) {
    return makeError(
      "LICENSE_BLOCKED",
      `Component "${component.id}" uses blocked license "${component.license}".`,
      component.id,
      {
        license: component.license,
      }
    );
  }

  if (!isAllowedLicense(component.license, manifest)) {
    return makeError(
      "LICENSE_BLOCKED",
      `Component "${component.id}" license "${component.license}" is not in the Monet allowlist.`,
      component.id,
      {
        license: component.license,
        allowedLicenses: manifest.policy.allowedLicenses,
      }
    );
  }

  // If the component is GPL licensed (and NOT LGPL), it MUST be gated behind SaaS/Server-only constraints
  const isGplOnly = (component.license.startsWith("GPL") || component.license.includes("GPL")) &&
                    !component.license.startsWith("LGPL") && !component.license.includes("LGPL");
  if (isGplOnly) {
    const hasSaasConstraint = component.constraints.includes("saas-loophole-only") || 
                              component.constraints.includes("never-distribute-binaries") ||
                              component.constraints.includes("server-only-execution");
    if (!hasSaasConstraint) {
      return makeError(
        "CONSTRAINT_VIOLATION",
        `Component "${component.id}" uses GPL license "${component.license}" but is missing required SaaS-loophole constraints ("saas-loophole-only", "never-distribute-binaries", or "server-only-execution").`,
        component.id,
        {
          license: component.license,
          constraints: component.constraints,
        }
      );
    }
  }

  return validateArtifactPins(component);
}

export function parseLicenseManifest(value: unknown): LicenseGateResult<LicenseManifest> {
  if (!isRecord(value)) {
    return makeError("INVALID_MANIFEST", "License manifest must be an object.");
  }

  const schemaVersion = readString(value, "schemaVersion");
  if (schemaVersion !== "1.0.0") {
    return makeError("INVALID_MANIFEST", "License manifest schemaVersion must be 1.0.0.", undefined, {
      schemaVersion,
    });
  }

  const policyUnknown = value.policy;
  if (!isRecord(policyUnknown)) {
    return makeError("INVALID_MANIFEST", "License manifest policy must be an object.");
  }

  const allowedLicensesRaw = readArray(policyUnknown, "allowedLicenses");
  const blockedLicensesRaw = readArray(policyUnknown, "blockedLicenses");
  const failClosed = readBoolean(policyUnknown, "failClosed");
  const allowIsc = readBoolean(policyUnknown, "allowIsc");

  if (!allowedLicensesRaw || !blockedLicensesRaw || failClosed !== true || allowIsc !== false) {
    return makeError("INVALID_MANIFEST", "License manifest policy is invalid or not fail-closed.", undefined, {
      failClosed,
      allowIsc,
    });
  }

  const allowedLicenses: AllowedLicense[] = [];
  for (const license of allowedLicensesRaw) {
    if (
      license === "MIT" ||
      license === "Apache-2.0" ||
      license === "LGPL-2.1-or-later" ||
      license === "LGPL-3.0-or-later" ||
      license === "GPL-2.0" ||
      license === "GPL-3.0" ||
      license === "GPL-2.0-or-later" ||
      license === "GPL-3.0-or-later"
    ) {
      allowedLicenses.push(license as AllowedLicense);
    } else {
      return makeError("INVALID_MANIFEST", `Unsupported allowed license "${String(license)}".`);
    }
  }

  const blockedLicenses: string[] = [];
  for (const license of blockedLicensesRaw) {
    if (typeof license !== "string" || license.trim().length === 0) {
      return makeError("INVALID_MANIFEST", "blockedLicenses must contain only non-empty strings.");
    }

    blockedLicenses.push(license.trim());
  }

  const componentsRaw = readArray(value, "components");
  if (!componentsRaw || componentsRaw.length === 0) {
    return makeError("INVALID_MANIFEST", "License manifest must include at least one component.");
  }

  const components: LicenseComponent[] = [];

  for (const componentRaw of componentsRaw) {
    if (!isRecord(componentRaw)) {
      return makeError("INVALID_MANIFEST", "Each component must be an object.");
    }

    const id = readString(componentRaw, "id");
    const name = readString(componentRaw, "name");
    const category = readString(componentRaw, "category");
    const license = readString(componentRaw, "license");
    const commercialUse = readBoolean(componentRaw, "commercialUse");
    const status = readString(componentRaw, "status");
    const downloadPolicy = readString(componentRaw, "downloadPolicy");
    const constraintsRaw = readArray(componentRaw, "constraints") ?? [];
    const artifactsRaw = readArray(componentRaw, "artifacts") ?? [];
    const blockedVariantsRaw = readArray(componentRaw, "blockedVariants") ?? [];
    const sourceRaw = componentRaw.source;

    if (
      !id ||
      !name ||
      !category ||
      !license ||
      commercialUse === null ||
      !status ||
      !downloadPolicy ||
      !isRecord(sourceRaw)
    ) {
      return makeError("INVALID_MANIFEST", "Component is missing required fields.", id ?? undefined);
    }

    const sourceType = readString(sourceRaw, "type");
    const sourceLocator = readString(sourceRaw, "locator");
    if (!sourceType || !sourceLocator) {
      return makeError("INVALID_MANIFEST", `Component "${id}" source is invalid.`, id);
    }

    const artifacts: LicenseArtifact[] = [];
    for (const artifactRaw of artifactsRaw) {
      if (!isRecord(artifactRaw)) {
        return makeError("INVALID_MANIFEST", `Component "${id}" artifact must be an object.`, id);
      }

      const artifactType = readString(artifactRaw, "type");
      const artifactName = readString(artifactRaw, "name");
      const artifactSha256 = readString(artifactRaw, "sha256") ?? undefined;
      const artifactRequired = readBoolean(artifactRaw, "required") ?? undefined;

      if (!artifactType || !artifactName) {
        return makeError("INVALID_MANIFEST", `Component "${id}" artifact is missing type or name.`, id);
      }

      artifacts.push({
        type: artifactType as LicenseArtifact["type"],
        name: artifactName,
        sha256: artifactSha256,
        required: artifactRequired,
      });
    }

    const constraints: string[] = [];
    for (const constraint of constraintsRaw) {
      if (typeof constraint !== "string" || constraint.trim().length === 0) {
        return makeError("INVALID_MANIFEST", `Component "${id}" has invalid constraint.`, id);
      }

      constraints.push(constraint.trim());
    }

    const blockedVariants: BlockedVariant[] = [];
    for (const variantRaw of blockedVariantsRaw) {
      if (!isRecord(variantRaw)) {
        return makeError("INVALID_MANIFEST", `Component "${id}" blocked variant must be an object.`, id);
      }

      const variantName = readString(variantRaw, "name");
      const reason = readString(variantRaw, "reason");
      const variantLicense = readString(variantRaw, "license") ?? undefined;

      if (!variantName || !reason) {
        return makeError("INVALID_MANIFEST", `Component "${id}" blocked variant is invalid.`, id);
      }

      blockedVariants.push({
        name: variantName,
        reason,
        license: variantLicense,
      });
    }

    components.push({
      id,
      name,
      category: category as LicenseComponent["category"],
      license,
      commercialUse,
      status: status as ComponentStatus,
      source: {
        type: sourceType as LicenseComponent["source"]["type"],
        locator: sourceLocator,
        version: readString(sourceRaw, "version") ?? undefined,
        commit: readString(sourceRaw, "commit") ?? undefined,
      },
      downloadPolicy: downloadPolicy as DownloadPolicy,
      artifacts,
      constraints,
      blockedVariants,
      notes: readString(componentRaw, "notes") ?? undefined,
    });
  }

  return {
    success: true,
    data: {
      schemaVersion: "1.0.0",
      policy: {
        allowedLicenses,
        blockedLicenses,
        failClosed: true,
        allowIsc: false,
      },
      components,
    },
  };
}

export function validateLicenseManifest(value: unknown): LicenseGateResult<LicenseManifest> {
  const parsed = parseLicenseManifest(value);
  if (!parsed.success || !parsed.data) {
    return parsed;
  }

  const ids = new Set<string>();

  for (const component of parsed.data.components) {
    if (ids.has(component.id)) {
      return makeError<LicenseManifest>("INVALID_MANIFEST", `Duplicate component id "${component.id}".`, component.id);
    }

    ids.add(component.id);

    if (component.status === "approved") {
      const result = validateComponent(component, parsed.data);
      if (!result.success) {
        return result as unknown as LicenseGateResult<LicenseManifest>;
      }
    }
  }

  return parsed;
}

export function assertComponentAllowed(
  manifest: LicenseManifest,
  componentId: string,
  requiredConstraints: string[] = []
): LicenseGateResult<LicenseComponent> {
  const component = manifest.components.find((entry) => entry.id === componentId);

  if (!component) {
    return makeError<LicenseComponent>("COMPONENT_NOT_FOUND", `Component "${componentId}" was not found in license manifest.`, componentId);
  }

  const validation = validateComponent(component, manifest);
  if (!validation.success) {
    return validation as unknown as LicenseGateResult<LicenseComponent>;
  }

  for (const requiredConstraint of requiredConstraints) {
    if (!component.constraints.includes(requiredConstraint)) {
      return makeError(
        "CONSTRAINT_VIOLATION",
        `Component "${componentId}" is missing required constraint "${requiredConstraint}".`,
        componentId,
        {
          requiredConstraint,
          constraints: component.constraints,
        }
      );
    }
  }

  return {
    success: true,
    data: component,
  };
}

export function assertVariantNotBlocked(
  manifest: LicenseManifest,
  componentId: string,
  variantName: string
): LicenseGateResult {
  const component = manifest.components.find((entry) => entry.id === componentId);

  if (!component) {
    return makeError("COMPONENT_NOT_FOUND", `Component "${componentId}" was not found in license manifest.`, componentId);
  }

  const normalizedVariant = variantName.trim().toLowerCase();

  const blocked = component.blockedVariants.find(
    (variant) => variant.name.trim().toLowerCase() === normalizedVariant
  );

  if (blocked) {
    return makeError(
      "COMPONENT_BLOCKED",
      `Variant "${variantName}" is blocked for component "${componentId}": ${blocked.reason}`,
      componentId,
      {
        variantName,
        reason: blocked.reason,
        license: blocked.license,
      }
    );
  }

  return { success: true };
}
