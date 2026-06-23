import "dotenv/config";

import "./queues/render-preview.worker";
import "./queues/render-final.worker";
import "./queues/enhance-edl.worker";
import "./queues/generate-edl.worker";

process.on("SIGINT", () => {
  console.log("[worker-node] SIGINT received");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[worker-node] SIGTERM received");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("[worker-node] uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker-node] unhandledRejection", reason);
  process.exit(1);
});

console.log("[worker-node] Monet workers online");