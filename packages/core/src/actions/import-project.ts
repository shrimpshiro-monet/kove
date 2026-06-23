export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

interface ImportProjectParams {
  project: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidProject(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isRecord(value.timeline)) return false;
  if (!Array.isArray(value.timeline.tracks)) return false;
  if (!isRecord(value.mediaLibrary)) return false;
  if (!Array.isArray(value.mediaLibrary.items)) return false;
  if (!isRecord(value.settings)) return false;

  return true;
}

export async function importProjectAction(
  params: ImportProjectParams,
  project: Record<string, unknown>
): Promise<ActionResult<{ importedAt: number }>> {
  try {
    if (!params || !isValidProject(params.project)) {
      return {
        success: false,
        error: {
          code: "INVALID_PROJECT",
          message: "IMPORT_PROJECT requires a valid project payload",
        },
      };
    }

    for (const key of Object.keys(project)) {
      delete project[key];
    }

    Object.assign(project, params.project);

    return {
      success: true,
      data: {
        importedAt: Date.now(),
      },
    };
  } catch (error) {
    console.error("[import-project] failed", { error });

    return {
      success: false,
      error: {
        code: "IMPORT_PROJECT_FAILED",
        message: "Failed to import project",
      },
    };
  }
}
