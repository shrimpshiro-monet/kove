import React from "react";
import { EffectParamDefinition } from "./effect-control-registry";
import { useIsProcessing } from "../../../stores/project-store";

interface EffectParamControlProps {
  definition: EffectParamDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function EffectParamControl({
  definition,
  value,
  onChange,
}: EffectParamControlProps): React.JSX.Element {
  const isProcessing = useIsProcessing();
  if (definition.kind === "number") {
    const numericValue =
      typeof value === "number" && Number.isFinite(value)
        ? value
        : typeof definition.defaultValue === "number"
          ? definition.defaultValue
          : 0;

    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{definition.label}</span>
        <input
          className="rounded border bg-background px-2 py-1"
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.step ?? 1}
          value={numericValue}
           onChange={(event) => {
            if (isProcessing) return;
            const nextValue = Number(event.currentTarget.value);

            if (!Number.isFinite(nextValue)) {
              return;
            }

            onChange(nextValue);
          }}
        />
      </label>
    );
  }

  if (definition.kind === "boolean") {
    const checked =
      typeof value === "boolean"
        ? value
        : typeof definition.defaultValue === "boolean"
          ? definition.defaultValue
          : false;

    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{definition.label}</span>
        <input
          type="checkbox"
          checked={checked}
           onChange={(event) => {
            if (isProcessing) return;
            onChange(event.currentTarget.checked);
          }}
        />
      </label>
    );
  }

  if (definition.kind === "select") {
    const options = definition.options ?? [];
    const stringValue =
      typeof value === "string"
        ? value
        : typeof definition.defaultValue === "string"
          ? definition.defaultValue
          : options[0] ?? "";

    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{definition.label}</span>
        <select
          className="rounded border bg-background px-2 py-1"
          value={stringValue}
           onChange={(event) => {
            if (isProcessing) return;
            onChange(event.currentTarget.value);
          }}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const textValue =
    typeof value === "string"
      ? value
      : typeof definition.defaultValue === "string"
        ? definition.defaultValue
        : "";

  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{definition.label}</span>
      <input
        className="rounded border bg-background px-2 py-1"
        type="text"
        value={textValue}
        onChange={(event) => {
          if (isProcessing) return;
          onChange(event.currentTarget.value);
        }}
      />
    </label>
  );
}