import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const TRACKS_DIR = path.resolve(process.cwd(), "storage/subject-tracks");
fs.mkdirSync(TRACKS_DIR, { recursive: true });

const SubjectTrackSchema = z.object({
  clipId: z.string(),
  sourceAssetId: z.string(),
  model: z.enum(["mediapipe", "headless"]),
  mediapipeVersion: z.string().optional(),
  createdAt: z.number(),
  duration: z.number(),
  fps: z.number(),
  detections: z.array(z.object({
    time: z.number(),
    frame: z.number(),
    bbox: z.object({
      x: z.number(), y: z.number(), width: z.number(), height: z.number(),
      centerX: z.number(), centerY: z.number(),
    }),
    source: z.string(),
    confidence: z.number(),
    trackId: z.number(),
    label: z.string(),
  })),
  gapPolicy: z.enum(["hold-last", "interpolate", "decay-to-center"]),
});

export async function registerSubjectTrackRoutes(app: FastifyInstance): Promise<void> {
  // POST — persist a subject track
  app.post("/api/subject-track", async (req, res) => {
    const parsed = SubjectTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).send({ error: parsed.error.flatten() });
    }

    const { sourceAssetId, model, mediapipeVersion } = parsed.data;
    const filename = `${sourceAssetId}-${model}${mediapipeVersion ? `-${mediapipeVersion}` : ""}.json`;
    const filepath = path.join(TRACKS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(parsed.data, null, 2));
    return res.send({ success: true, filename });
  });

  // GET — retrieve a subject track
  app.get<{ Params: { sourceAssetId: string } }>(
    "/api/subject-track/:sourceAssetId",
    async (req, res) => {
      const { sourceAssetId } = req.params;
      const files = fs.readdirSync(TRACKS_DIR)
        .filter((f) => f.startsWith(sourceAssetId))
        .sort()
        .reverse();

      if (files.length === 0) {
        return res.status(404).send({ error: "No track found" });
      }

      const track = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, files[0]), "utf-8"));
      return res.send(track);
    },
  );
}
