import React, { useState, useEffect, useRef } from "react";

interface PipelineStep {
  text: string;
}

interface ProgressPipelineProps {
  steps: PipelineStep[];
  activeStep: number;
  failedStep?: number;
  failReason?: string;
  onComplete?: () => void;
}

export function ProgressPipeline({ steps, activeStep, failedStep, failReason, onComplete }: ProgressPipelineProps) {
  const [typedChars, setTypedChars] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepRef = useRef(activeStep);

  // Reset typing when active step changes
  useEffect(() => {
    if (activeStep !== prevStepRef.current) {
      prevStepRef.current = activeStep;
      setTypedChars(0);
    }
  }, [activeStep]);

  // Type out current step
  useEffect(() => {
    if (activeStep >= steps.length || failedStep !== undefined) {
      if (activeStep >= steps.length) onComplete?.();
      return;
    }

    const text = steps[activeStep].text;
    let charIndex = typedChars;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      charIndex++;
      setTypedChars(charIndex);

      if (charIndex >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 25);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeStep, steps, typedChars, failedStep, onComplete]);

  return (
    <div className="font-mono text-[13px] text-text-secondary space-y-1.5 px-6">
      {steps.map((step, i) => {
        const isComplete = i < activeStep;
        const isActive = i === activeStep && failedStep === undefined;
        const isFailed = i === failedStep;

        return (
          <div
            key={i}
            className={`flex items-center gap-2 transition-opacity duration-300 ${
              isComplete ? "text-text-tertiary opacity-60" :
              isActive ? "text-primary" :
              isFailed ? "text-destructive" :
              "text-text-tertiary opacity-30"
            }`}
          >
            <span className="select-none">
              {isComplete ? "[x]" : isFailed ? "[!]" : "[·]"}
            </span>
            <span>
              {isComplete ? step.text :
               isActive ? step.text.slice(0, typedChars) :
               isFailed ? `failed: ${failReason}` :
               step.text}
            </span>
            {isActive && typedChars < step.text.length && (
              <span className="w-1.5 h-4 bg-primary animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const GENERATION_PIPELINE: PipelineStep[] = [
  { text: "reading reference…" },
  { text: "extracting editing grammar…" },
  { text: "analyzing footage…" },
  { text: "scoring segments…" },
  { text: "building the cut…" },
  { text: "hydrating timeline…" },
  { text: "ready." },
];

export const REFINEMENT_PIPELINE: PipelineStep[] = [
  { text: "analyzing current edit…" },
  { text: "applying refinement…" },
  { text: "validating changes…" },
  { text: "done." },
];
