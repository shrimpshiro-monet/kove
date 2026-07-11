/**
 * Upload signing service.
 * Handles SigV4 signed URL generation for R2 direct uploads.
 * Used by upload.ts.
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "../types/env";

/**
 * Generate a signed upload URL for direct client → R2 upload.
 * Uses SigV4 signing when R2 credentials are configured.
 * Falls back to unsigned URL for local dev.
 */
export async function generateSignedUploadUrl(
  env: Env,
  key: string,
  contentType: string
): Promise<string> {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      region: "auto",
    });

    const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/monet-media-dev/${key}`;

    const signedRequest = await aws.sign(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
    });

    return signedRequest.url;
  }

  console.warn("[upload-signing] R2 credentials not configured, returning unsigned URL");
  return `https://monet-media-dev.r2.cloudflarestorage.com/${key}`;
}
