// Lightweight local stub for the editly runtime used by the Worker bundle.
// The app imports it from src/server/lib/render-engine-editly.ts, but the
// local dev run only needs the module to resolve so the Worker can boot.

export interface EditlyStubSpec {
  outPath?: string;
  clips?: unknown[];
  audioTracks?: unknown[];
  [key: string]: unknown;
}

export default async function editly(_spec: EditlyStubSpec): Promise<void> {
  throw new Error(
    "editly is not installed in this local workspace; install the runtime dependency to enable video rendering."
  );
}
