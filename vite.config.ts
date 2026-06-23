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
    const content = readFileSync(".dev.vars", "utf-8");
    const vars: Record<string, string> = {};
    const lines = content.split("\n");
    
    let currentKey = "";
    let currentValue = "";
    let inQuotes = false;
    let quoteChar = "";

    for (const line of lines) {
      if (!inQuotes) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        
        const equalsIdx = line.indexOf("=");
        if (equalsIdx !== -1) {
          const key = line.slice(0, equalsIdx).trim();
          let value = line.slice(equalsIdx + 1).trim();
          
          if (value.startsWith("'") || value.startsWith('"')) {
            quoteChar = value[0];
            inQuotes = true;
            currentKey = key;
            currentValue = value.slice(1);
            
            // Check if it ends on the same line
            if (currentValue.endsWith(quoteChar) && currentValue.length > 0) {
              vars[currentKey] = currentValue.slice(0, -1);
              inQuotes = false;
            }
          } else {
            vars[key] = value;
          }
        }
      } else {
        // We are inside quotes, append the line
        currentValue += "\n" + line;
        if (currentValue.endsWith(quoteChar)) {
          vars[currentKey] = currentValue.slice(0, -1);
          inQuotes = false;
        }
      }
    }
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
    server: {
      host: "127.0.0.1",
      port: 8787,
      proxy: {
        "/uploads": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
        },
        "/api/specialist": {
          target: "http://127.0.0.1:8788",
          changeOrigin: true,
          secure: false,
        },
      },
    },
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
      "process.env.GCS_BUCKET": JSON.stringify(
        loadDevVars().GCS_BUCKET || ""
      ),
      "process.env.ENVIRONMENT": JSON.stringify(
        loadDevVars().ENVIRONMENT || "development"
      ),
      "process.env.AZURE_OPENAI_API_KEY": JSON.stringify(
        loadDevVars().AZURE_OPENAI_API_KEY || ""
      ),
      "process.env.AZURE_OPENAI_ENDPOINT": JSON.stringify(
        loadDevVars().AZURE_OPENAI_ENDPOINT || ""
      ),
      "process.env.AZURE_OPENAI_DEPLOYMENT": JSON.stringify(
        loadDevVars().AZURE_OPENAI_DEPLOYMENT || ""
      ),
    },
  },
});
