import React from "react";
import { BlueprintPreview } from "./BlueprintPreview";
import { useProjectStore } from "../../stores/project-store";


export interface BlueprintPreviewConnectedProps {
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string) => void;
}

export function BlueprintPreviewConnected({
  selectedClipId,
  onSelectClip,
}: BlueprintPreviewConnectedProps): React.JSX.Element {
  const project = useProjectStore((state: any) => state.project);

  return (
    <BlueprintPreview
      project={project}
      selectedClipId={selectedClipId}
      onSelectClip={onSelectClip}
    />
  );
}