import { CatalogItem } from "./types";

import * as effects from "./effects";
import * as transitions from "./transitions";
import * as typography from "./typography";
import * as motion from "./motion";
import * as compositing from "./compositing";
import * as audio from "./audio";

export const MONET_CATALOG: Record<string, CatalogItem> = {
  ...effects,
  ...transitions,
  ...typography,
  ...motion,
  ...compositing,
  ...audio,
};

export function getCatalogSummary() {
  const summary: Record<string, string> = {};
  for (const [key, item] of Object.entries(MONET_CATALOG)) {
    summary[item.id] = item.aiRationale;
  }
  return summary;
}
