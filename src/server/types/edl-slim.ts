/**
 * Minimal EDL schema for generation — only fields the renderer actually uses.
 * Cuts schema from 9KB to ~1.5KB, giving Gemini room to complete the JSON.
 */
export const EDL_JSON_SCHEMA_SLIM = {
  type: "object",
  properties: {
    timeline: {
      type: "object",
      properties: {
        duration: { type: "number" },
      },
      required: ["duration"],
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          source: {
            type: "object",
            properties: {
              clipId: { type: "string" },
              inPoint: { type: "number" },
              outPoint: { type: "number" },
            },
            required: ["clipId", "inPoint", "outPoint"],
          },
          timing: {
            type: "object",
            properties: {
              startTime: { type: "number" },
              duration: { type: "number" },
              speed: { type: "number" },
            },
            required: ["startTime", "duration"],
          },
          effects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                intensity: { type: "number" },
              },
            },
          },
          transition: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["cut", "crossfade"] },
              duration: { type: "number" },
            },
          },
          beatLock: {
            type: "object",
            properties: {
              beatIndex: { type: "integer" },
              lockMode: { type: "string", enum: ["start"] },
            },
          },
          aiRationale: { type: "string" },
        },
        required: ["source", "timing"],
      },
    },
    globalEffects: {
      type: "object",
      properties: {
        colorGrade: { type: "string" },
      },
    },
  },
  required: ["timeline", "shots"],
} as const;
