// apps/web/src/engine/effects/layered-effect-runner.ts

import type { EffectBlock } from "@monet/edl";
import type { EffectContext } from "./effect-runner";
import { runEffects } from "./effect-runner";

export function partitionEffects(effects: EffectBlock[]) {
  const background: EffectBlock[] = [];
  const foreground: EffectBlock[] = [];

  for (const fx of effects) {
    const layer = (fx.params?.layer ?? "foreground") as string;

    if (layer === "background") {
      background.push(fx);
    } else {
      foreground.push(fx);
    }
  }

  return { background, foreground };
}

export function runLayeredEffects(
  effects: EffectBlock[],
  ctx: EffectContext
) {
  const { background, foreground } = partitionEffects(effects);

  return {
    runBackground() {
      runEffects(background, ctx);
    },
    runForeground() {
      runEffects(foreground, ctx);
    },
  };
}
