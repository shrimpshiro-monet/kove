import "dotenv/config";
import path from "node:path";
import cors from "@fastify/cors";
import fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { registerAnalyzeRoutes } from "./api/analyze";
import { registerCreateHeavyEditRoute } from "./api/create-heavy-edit";
import { registerRenderRoutes } from "./api/render";
import { registerRenderStatusRoute } from "./api/render-status";
import { registerSpatialRoutes } from "./api/spatial";
import { registerUploadDirectRoutes } from "./api/upload-direct";
import { registerBlenderRenderRoute } from "./api/blender-render";
import { registerVibeRenderRoute } from "./api/vibe-render";
import { registerNativeExecutorRoutes } from "./api/native-executor";
import { registerVibeGenerateRoute } from "./api/vibe-generate";
import { registerVibeRefineRoute } from "./api/vibe-refine";
import { registerDetectRoutes } from "./api/detect-routes";
import { registerAnalyzeReferenceRoute } from "./api/analyze-reference";

async function start(): Promise<void> {
  const app = fastify({
    logger: true,
    bodyLimit: 256 * 1024 * 1024
  });

  await app.register(cors, {
    origin: true
  });

  const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");

  await app.register(multipart, {
    limits: {
      files: 8,
      fileSize: 1024 * 1024 * 1024 // 1GB local dev ceiling
    }
  });

  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: "/uploads/",
    decorateReply: false
  });

  await registerAnalyzeRoutes(app);
  await registerCreateHeavyEditRoute(app);
  await registerRenderRoutes(app);
  await registerRenderStatusRoute(app);
  await registerSpatialRoutes(app);
  await registerUploadDirectRoutes(app);
  await registerBlenderRenderRoute(app);
  await registerVibeRenderRoute(app);
  await registerNativeExecutorRoutes(app);
  await registerVibeGenerateRoute(app);
  await registerVibeRefineRoute(app);
  await registerDetectRoutes(app);
  await registerAnalyzeReferenceRoute(app);

  app.get("/health", async () => ({
    status: "ok"
  }));

  const portRaw = process.env.MONET_API_PORT;
  const port = portRaw ? Number(portRaw) : 3000;

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Invalid MONET_API_PORT");
  }

  await app.listen({
    port,
    host: "0.0.0.0"
  });
}

start().catch((error) => {
  console.error("[api] failed to start", error);
  process.exit(1);
});
