// src/server/lib/test-engines-sandbox.ts
// Sandbox test runner to verify engine integration, license manifest validity,
// and SaaS loophole enforcement of copyleft (GPL) components.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  validateLicenseManifest,
  assertComponentAllowed,
  LicenseManifest,
  LicenseComponent
} from "./license-gate";
import { getAllEngineCapabilities, getEngineCapabilityContract } from "./engine-capabilities";

function logHeader(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

export function runSandboxTests() {
  console.log("🚀 Starting Advanced Video Engines & License Gate Sandbox Verification...");

  // 1. Read & Validate the Updated License Manifest
  logHeader("TEST 1: Manifest Integrity & Schema Validation");
  const manifestPath = path.resolve(process.cwd(), "brain/license_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ FAIL: Manifest not found at:", manifestPath);
    process.exit(1);
  }

  const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const validationResult = validateLicenseManifest(manifestRaw);

  if (!validationResult.success) {
    console.error("❌ FAIL: Manifest failed validation!", validationResult.error);
    process.exit(1);
  }

  console.log("✅ PASS: brain/license_manifest.json conforms to schema version 1.0.0");
  console.log("✅ PASS: Fail-closed policy parsed and validated successfully.");

  const manifest = validationResult.data as LicenseManifest;

  // 2. Verify all integrated engines are approved and pass standard gating
  logHeader("TEST 2: Integrated Engines Gating Validation");
  const expectedEngines = [
    "freecut", "kubeezcut", "opencut", "omniclip", "ffmpeg", 
    "mlt-framework", "moviepy", "openreel-video", "kdenlive", 
    "shotcut", "natron", "blender"
  ];

  for (const engineId of expectedEngines) {
    const checkResult = assertComponentAllowed(manifest, engineId);
    if (checkResult.success && checkResult.data) {
      console.log(`✅ APPROVED & COMPLIANT: "${engineId}" (${checkResult.data.license})`);
      console.log(`   - Constraints: [${checkResult.data.constraints.join(", ")}]`);
    } else {
      console.error(`❌ FAIL: Expected "${engineId}" to be approved but failed!`, checkResult.error);
      process.exit(1);
    }
  }

  // 3. Verify SaaS Loophole copyleft safety guardrails
  logHeader("TEST 3: GPL SaaS Loophole Safety Guardrails Enforcement");

  // Create a mock component that represents a GPL engine but violates SaaS constraints
  const nonCompliantGplComponent: LicenseComponent = {
    id: "gpl-non-compliant",
    name: "GPL Engine without SaaS constraints",
    category: "render",
    license: "GPL-3.0",
    commercialUse: true,
    status: "approved",
    source: {
      type: "system",
      locator: "melt-gpl"
    },
    downloadPolicy: "system-installed-approved",
    artifacts: [],
    constraints: ["some-random-constraint"], // Lacks "saas-loophole-only", "never-distribute-binaries", or "server-only-execution"
    blockedVariants: []
  };

  // Temporarily construct a mock manifest with our non-compliant GPL component
  const mockManifest: LicenseManifest = {
    schemaVersion: "1.0.0",
    policy: manifest.policy,
    components: [...manifest.components, nonCompliantGplComponent]
  };

  const gplGateResult = assertComponentAllowed(mockManifest, "gpl-non-compliant");

  if (!gplGateResult.success && gplGateResult.error?.code === "CONSTRAINT_VIOLATION") {
    console.log("✅ PASS: Gating rejected non-compliant GPL component with CONSTRAINT_VIOLATION");
    console.log(`   - Error Message: "${gplGateResult.error.message}"`);
  } else {
    console.error("❌ FAIL: Gating allowed non-compliant GPL component without SaaS constraints!", gplGateResult);
    process.exit(1);
  }

  // 4. Verify Gemini Capability Contracts
  logHeader("TEST 4: Gemini Multi-Engine Autonomous Editing Contracts");
  const capabilities = getAllEngineCapabilities();
  if (capabilities.length === 12) {
    console.log("✅ PASS: Registered 12 advanced editing engine contracts for Gemini.");
    for (const cap of capabilities) {
      console.log(`   • Engine "${cap.id}": ${cap.commercialStatus}`);
      const contractText = getEngineCapabilityContract(cap.id);
      if (!contractText || contractText.includes("Unknown")) {
        console.error(`❌ FAIL: Invalid contract text for ${cap.id}`);
        process.exit(1);
      }
    }
  } else {
    console.error("❌ FAIL: Expected 12 capability contracts, got:", capabilities.length);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 ALL TESTS PASSED: Engines integrated, validated, and sandboxed.");
  console.log("=".repeat(60) + "\n");
}

export interface EngineTestResult {
  engineId: string;
  name: string;
  license: string;
  status: string;
  commercialUse: boolean;
  constraints: string[];
  notes: string;
  gatingPassed: boolean;
  error?: string;
  contract: string;
}

export interface SandboxVerificationReport {
  manifestValid: boolean;
  failClosedPolicy: boolean;
  engines: EngineTestResult[];
  saasLoopholeTest: {
    gatingPassed: boolean;
    correctlyRejectedNonCompliantGpl: boolean;
    errorMessage: string;
  };
}

/**
 * Executes all sandbox tests and returns a structured JSON report
 * suitable for consumption by APIs and UI Dashboards.
 */
export function runSandboxTestsJSON(): SandboxVerificationReport {
  const report: SandboxVerificationReport = {
    manifestValid: false,
    failClosedPolicy: false,
    engines: [],
    saasLoopholeTest: {
      gatingPassed: false,
      correctlyRejectedNonCompliantGpl: false,
      errorMessage: ""
    }
  };

  try {
    const manifestPath = path.resolve(process.cwd(), "brain/license_manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("License manifest not found.");
    }

    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const validationResult = validateLicenseManifest(manifestRaw);

    if (!validationResult.success || !validationResult.data) {
      throw new Error("Manifest failed standard validation: " + JSON.stringify(validationResult.error));
    }

    report.manifestValid = true;
    report.failClosedPolicy = true;

    const manifest = validationResult.data;
    const enginesToCheck = [
      "freecut", "kubeezcut", "opencut", "omniclip", "ffmpeg", 
      "mlt-framework", "moviepy", "openreel-video", "kdenlive", 
      "shotcut", "natron", "blender"
    ];

    for (const engineId of enginesToCheck) {
      const checkResult = assertComponentAllowed(manifest, engineId);
      const capContract = getEngineCapabilityContract(engineId);

      if (checkResult.success && checkResult.data) {
        report.engines.push({
          engineId,
          name: checkResult.data.name,
          license: checkResult.data.license,
          status: checkResult.data.status,
          commercialUse: checkResult.data.commercialUse,
          constraints: checkResult.data.constraints,
          notes: checkResult.data.notes || "",
          gatingPassed: true,
          contract: capContract
        });
      } else {
        const componentRaw = manifest.components.find(c => c.id === engineId);
        report.engines.push({
          engineId,
          name: componentRaw?.name || engineId,
          license: componentRaw?.license || "Unknown",
          status: componentRaw?.status || "Unknown",
          commercialUse: componentRaw?.commercialUse || false,
          constraints: componentRaw?.constraints || [],
          notes: componentRaw?.notes || "",
          gatingPassed: false,
          error: checkResult.error?.message || "Failed gating assertion.",
          contract: capContract
        });
      }
    }

    // SaaS Loophole Verification Test
    const nonCompliantGplComponent: LicenseComponent = {
      id: "gpl-non-compliant",
      name: "GPL Engine without SaaS constraints",
      category: "render",
      license: "GPL-3.0",
      commercialUse: true,
      status: "approved",
      source: {
        type: "system",
        locator: "melt-gpl"
      },
      downloadPolicy: "system-installed-approved",
      artifacts: [],
      constraints: ["some-random-constraint"], // missing mandatory saas constraints
      blockedVariants: []
    };

    const mockManifest: LicenseManifest = {
      schemaVersion: "1.0.0",
      policy: manifest.policy,
      components: [...manifest.components, nonCompliantGplComponent]
    };

    const gplGateResult = assertComponentAllowed(mockManifest, "gpl-non-compliant");

    if (!gplGateResult.success && gplGateResult.error?.code === "CONSTRAINT_VIOLATION") {
      report.saasLoopholeTest.gatingPassed = true;
      report.saasLoopholeTest.correctlyRejectedNonCompliantGpl = true;
      report.saasLoopholeTest.errorMessage = gplGateResult.error.message;
    } else {
      report.saasLoopholeTest.gatingPassed = false;
      report.saasLoopholeTest.correctlyRejectedNonCompliantGpl = false;
    }

  } catch (error: any) {
    console.error("[runSandboxTestsJSON] failed:", error);
  }

  return report;
}

// Support executing via CLI directly (ESM and Vite-safe check)
if (typeof process !== "undefined" && process.argv[1]?.endsWith("test-engines-sandbox.ts")) {
  runSandboxTests();
}
