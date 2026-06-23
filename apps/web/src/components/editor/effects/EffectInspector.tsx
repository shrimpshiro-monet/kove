import React, { useMemo, useState } from "react";
import {
  Clip,
  MonetEffectBlock,
  Project,
} from "@monet/core";
import { EffectParamControl } from "./EffectParamControl";
import {
  createDefaultEffect,
  EFFECT_DEFINITIONS,
  getEffectDefinition,
} from "./effect-control-registry";

interface EffectInspectorProps {
  project: Project;
  selectedClipId: string | null;
  onUpsertEffect: (clipId: string, effect: MonetEffectBlock) => Promise<void>;
  onRemoveEffect: (clipId: string, effectId: string) => Promise<void>;
}

interface ClipLookup {
  clip: Clip;
  trackId: string;
}

export function EffectInspector({
  project,
  selectedClipId,
  onUpsertEffect,
  onRemoveEffect,
}: EffectInspectorProps): React.JSX.Element {
  const [pendingEffectType, setPendingEffectType] =
    useState<MonetEffectBlock["type"]>("impact_flash");

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;

    const clipMap = new Map<string, ClipLookup>();

    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        clipMap.set(clip.id, {
          clip,
          trackId: track.id,
        });
      }
    }

    return clipMap.get(selectedClipId) ?? null;
  }, [project, selectedClipId]);

  const effects = useMemo(() => {
    const rawEffects = selectedClip?.clip.meta?.effects;

    if (!Array.isArray(rawEffects)) {
      return [];
    }

    return rawEffects.filter(isEffectBlock);
  }, [selectedClip]);

  if (!selectedClipId || !selectedClip) {
    return (
      <aside className="flex h-full flex-col gap-3 border-l p-4">
        <h2 className="text-sm font-semibold">Effect Inspector</h2>
        <p className="text-sm text-muted-foreground">
          Select a clip to edit Monet effects.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-l p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Effect Inspector</h2>
        <p className="text-xs text-muted-foreground">
          Clip: <span className="font-mono">{selectedClip.clip.id}</span>
        </p>
      </header>

      <section className="flex flex-col gap-2 rounded border p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Add Effect</span>
          <select
            className="rounded border bg-background px-2 py-1"
            value={pendingEffectType}
            onChange={(event) => {
              const nextType = event.currentTarget.value;

              if (isEffectType(nextType)) {
                setPendingEffectType(nextType);
              }
            }}
          >
            {EFFECT_DEFINITIONS.map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
          type="button"
          onClick={async () => {
            const effect = createDefaultEffect(
              pendingEffectType,
              selectedClip.clip.startTime
            );

            await onUpsertEffect(selectedClip.clip.id, effect);
          }}
        >
          Add to Clip
        </button>
      </section>

      <section className="flex flex-col gap-3">
        {effects.length === 0 ? (
          <p className="rounded border p-3 text-xs text-muted-foreground">
            No Monet effects on this clip yet.
          </p>
        ) : (
          effects.map((effect) => (
            <EffectCard
              key={effect.id}
              clipId={selectedClip.clip.id}
              effect={effect}
              onUpsertEffect={onUpsertEffect}
              onRemoveEffect={onRemoveEffect}
            />
          ))
        )}
      </section>
    </aside>
  );
}

interface EffectCardProps {
  clipId: string;
  effect: MonetEffectBlock;
  onUpsertEffect: (clipId: string, effect: MonetEffectBlock) => Promise<void>;
  onRemoveEffect: (clipId: string, effectId: string) => Promise<void>;
}

function EffectCard({
  clipId,
  effect,
  onUpsertEffect,
  onRemoveEffect,
}: EffectCardProps): React.JSX.Element {
  const definition = getEffectDefinition(effect.type);

  if (!definition) {
    return (
      <article className="flex flex-col gap-2 rounded border border-destructive p-3">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-xs">Unknown Effect</strong>
          <button
            className="rounded border px-2 py-1 text-xs"
            type="button"
            onClick={async () => onRemoveEffect(clipId, effect.id)}
          >
            Remove
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{effect.type}</p>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-3 rounded border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <strong className="text-xs">{definition.label}</strong>
          <p className="text-xs text-muted-foreground">{definition.description}</p>
        </div>

        <button
          className="rounded border px-2 py-1 text-xs"
          type="button"
          onClick={async () => onRemoveEffect(clipId, effect.id)}
        >
          Remove
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Start</span>
        <input
          className="rounded border bg-background px-2 py-1"
          type="number"
          min={0}
          step={0.01}
          value={effect.start}
          onChange={async (event) => {
            const nextStart = Number(event.currentTarget.value);

            if (!Number.isFinite(nextStart) || nextStart < 0) {
              return;
            }

            await onUpsertEffect(clipId, {
              ...effect,
              start: nextStart,
            });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Duration</span>
        <input
          className="rounded border bg-background px-2 py-1"
          type="number"
          min={0}
          step={0.01}
          value={effect.duration}
          onChange={async (event) => {
            const nextDuration = Number(event.currentTarget.value);

            if (!Number.isFinite(nextDuration) || nextDuration < 0) {
              return;
            }

            await onUpsertEffect(clipId, {
              ...effect,
              duration: nextDuration,
            });
          }}
        />
      </label>

      <div className="flex flex-col gap-2">
        {definition.params.map((paramDefinition) => (
          <EffectParamControl
            key={paramDefinition.key}
            definition={paramDefinition}
            value={effect.params[paramDefinition.key]}
            onChange={async (nextValue) => {
              await onUpsertEffect(clipId, {
                ...effect,
                params: {
                  ...effect.params,
                  [paramDefinition.key]: nextValue,
                },
              });
            }}
          />
        ))}
      </div>
    </article>
  );
}

function isEffectType(value: string): value is MonetEffectBlock["type"] {
  return EFFECT_DEFINITIONS.some((definition) => definition.type === value);
}

function isEffectBlock(value: unknown): value is MonetEffectBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.type === "string" &&
    isEffectType(record.type) &&
    typeof record.start === "number" &&
    Number.isFinite(record.start) &&
    typeof record.duration === "number" &&
    Number.isFinite(record.duration) &&
    Boolean(record.params) &&
    typeof record.params === "object" &&
    !Array.isArray(record.params)
  );
}