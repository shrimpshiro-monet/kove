import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";

const UPLOAD_DIR = path.resolve(process.cwd(), "storage/uploads");

function safeFilename(filename: string): string {
  return filename
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 160);
}

function createAssetId(): string {
  return `asset_${crypto.randomUUID()}`;
}

export async function registerUploadDirectRoutes(app: FastifyInstance) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  app.post("/api/upload/direct", async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        success: false,
        ok: false,
        error: "No file was uploaded. Expected multipart/form-data with a file field.",
      });
    }

    const assetId = createAssetId();
    const originalName = file.filename || "upload.bin";
    const filename = `${assetId}-${safeFilename(originalName)}`;
    const localPath = path.join(UPLOAD_DIR, filename);

    await pipeline(file.file, createWriteStream(localPath));

    const stat = await fs.stat(localPath);

    const asset = {
      id: assetId,
      assetId,
      filename: originalName,
      storedFilename: filename,
      mimeType: file.mimetype,
      size: stat.size,
      localPath,
      url: `/uploads/${filename}`,
      createdAt: new Date().toISOString(),
    };

    request.log.info(
      {
        assetId,
        filename: originalName,
        mimeType: file.mimetype,
        size: stat.size,
        localPath,
      },
      "Direct upload completed"
    );

    return reply.send({
      success: true,
      ok: true,
      fileId: assetId,
      r2Key: assetId,
      filename: originalName,
      size: stat.size,
      asset,
      file: asset,
      url: asset.url,
    });
  });
}
