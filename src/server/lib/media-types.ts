/**
 * Shared media type validation constants.
 * Single source of truth for allowed MIME types per media category.
 */

export const VALID_MEDIA_TYPES: Record<string, string[]> = {
  footage: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
  music: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
  reference: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
};

export type MediaType = keyof typeof VALID_MEDIA_TYPES;

export function isValidMediaType(type: string, contentType: string): boolean {
  return VALID_MEDIA_TYPES[type]?.includes(contentType) ?? false;
}
