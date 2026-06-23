import { convertEDLToProject } from "@monet/openreel-adapter";
import { ProjectEDL as MonetEDL } from "@monet/edl";

interface Action {
  type: string;
  id: string;
  timestamp: number;
  params: Record<string, any>;
}

interface ActionResult {
  success: boolean;
  error?: { code: string; message: string };
}

export async function applyEDLToProject(
  edl: MonetEDL,
  get: any,
  set: any
): Promise<ActionResult> {
  try {
    if (!edl) {
      return {
        success: false,
        error: { code: "INVALID_EDL", message: "EDL missing" },
      };
    }

    const { actionExecutor } = get();

    const project = convertEDLToProject(edl);

    const action: Action = {
      type: "IMPORT_PROJECT",
      id: `action-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        project,
      },
    };

    const projectCopy = structuredClone(get().project);

    const result = await actionExecutor.execute(action, projectCopy);

    if (!result.success) {
      return result;
    }

    set({
      project: {
        ...project,
        modifiedAt: Date.now(),
      },
    });

    console.log("[EDL Adapter] Project applied successfully");

    return { success: true };
  } catch (error) {
    console.error("[EDL Adapter] Failed", error);

    return {
      success: false,
      error: {
        code: "ADAPTER_FAIL",
        message: "Failed to convert EDL to project",
      },
    };
  }
}