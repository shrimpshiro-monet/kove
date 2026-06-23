import type { FastifyInstance } from "fastify";
import {
  analyzeAudioWithPython,
  trackSubjectWithPython,
  transcribeWithPython
} from "../services/python-workers";

function getStringField(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const value = (body as Record<string, unknown>)[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

export async function registerAnalyzeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/analyze/audio", async (req, res) => {
    const filePath = getStringField(req.body, "filePath");

    if (!filePath) {
      return res.status(400).send({
        success: false,
        error: {
          code: "INVALID_FILE_PATH",
          message: "filePath is required"
        }
      });
    }

    const result = await analyzeAudioWithPython(filePath);

    if (!result.success) {
      return res.status(502).send(result);
    }

    return res.send(result);
  });

  app.post("/analyze/transcript", async (req, res) => {
    const filePath = getStringField(req.body, "filePath");

    if (!filePath) {
      return res.status(400).send({
        success: false,
        error: {
          code: "INVALID_FILE_PATH",
          message: "filePath is required"
        }
      });
    }

    const result = await transcribeWithPython(filePath);

    if (!result.success) {
      return res.status(502).send(result);
    }

    return res.send(result);
  });

  app.post("/analyze/subject-track", async (req, res) => {
    const filePath = getStringField(req.body, "filePath");

    if (!filePath) {
      return res.status(400).send({
        success: false,
        error: {
          code: "INVALID_FILE_PATH",
          message: "filePath is required"
        }
      });
    }

    const result = await trackSubjectWithPython(filePath);

    if (!result.success) {
      return res.status(502).send(result);
    }

    return res.send(result);
  });
}