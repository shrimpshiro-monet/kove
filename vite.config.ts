// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { readFileSync } from "fs";

// Load .dev.vars for local development
function loadDevVars() {
  try {
    const devVars = readFileSync(".dev.vars", "utf-8");
    const vars: Record<string, string> = {};
    devVars.split("\n").forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join("=").trim();
        }
      }
    });
    return vars;
  } catch {
    return {};
  }
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      // Inject .dev.vars into process.env for SSR
      "process.env.GEMINI_API_KEY": JSON.stringify(
        loadDevVars().GEMINI_API_KEY || ""
      ),
      "process.env.GCP_PROJECT_ID": JSON.stringify(
        loadDevVars().GCP_PROJECT_ID || ""
      ),
      "process.env.GCP_LOCATION": JSON.stringify(
        loadDevVars().GCP_LOCATION || ""
      ),
      "process.env.GCP_CREDENTIALS": JSON.stringify(
        loadDevVars().GCP_CREDENTIALS || ""
      ),
      "process.env.ENVIRONMENT": JSON.stringify(
        loadDevVars().ENVIRONMENT || "development"
      ),
    },
  },
});
