import React from "react";
import { MonetEffectBlock } from "@monet/core";
import {
  applyClipEffectEdit,
  removeClipEffectEdit,
} from "../../../stores/monet-effect-store-adapter";
import { useProjectStore } from "../../../stores/project-store";
import { EffectInspector } from "./EffectInspector";

interface EffectInspectorConnectedProps {
  selectedClipId: string | null;
}

export function EffectInspectorConnected({
  selectedClipId,
}: EffectInspectorConnectedProps): React.JSX.Element {
  const project = useProjectStore((state: any) => state.project);
  const getStore = useProjectStore.getState;
  const setProject = useProjectStore.setState;

  async function handleUpsertEffect(
    clipId: string,
    effect: MonetEffectBlock
  ): Promise<void> {
    const result = await applyClipEffectEdit(
      { clipId, effect },
      getStore,
      setProject
    );

    if (!result.success) {
      console.error("[EffectInspectorConnected] Upsert failed", result.error);
    }
  }

  async function handleRemoveEffect(
    clipId: string,
    effectId: string
  ): Promise<void> {
    const result = await removeClipEffectEdit(
      { clipId, effectId },
      getStore,
      setProject
    );

    if (!result.success) {
      console.error("[EffectInspectorConnected] Remove failed", result.error);
    }
  }

  return (
    <EffectInspector
      project={project}
      selectedClipId={selectedClipId}
      onUpsertEffect={handleUpsertEffect}
      onRemoveEffect={handleRemoveEffect}
    />
  );
}