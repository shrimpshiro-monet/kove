import type { Env } from "../types/env";
import { compileStyle } from "../services/style-compiler";

export async function handleStyleCompile(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { prompt?: string };
    const prompt = body?.prompt?.trim();

    if (!prompt || prompt.length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: { code: "INVALID_REQUEST", message: "prompt must be at least 3 characters" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await compileStyle(env, prompt);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[api/style/compile] failed:", err);
    return new Response(
      JSON.stringify({ success: false, error: { code: "STYLE_COMPILE_FAILED", message: err.message || "Unknown error" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
