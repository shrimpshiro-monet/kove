// InteractiveThinkingPanel.tsx
// Shows AI director's thinking process in real-time
// Allows user to answer clarifying questions

import { useState, useEffect } from "react";
import { Brain, Film, Music, Scissors, Sparkles, Palette, MessageCircle, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ThinkingThought {
  stage: string;
  text: string;
  icon: string;
  duration_ms: number;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  type: "suggestion" | "clarification" | "requirement";
  impact: "critical" | "high" | "medium" | "low";
}

interface InteractiveThinkingPanelProps {
  thoughts: ThinkingThought[];
  questions: ClarifyingQuestion[];
  isThinking: boolean;
  onQuestionAnswer?: (questionId: string, answer: string) => void;
  className?: string;
}

const ICONS: Record<string, React.ReactNode> = {
  brain: <Brain className="h-4 w-4" />,
  film: <Film className="h-4 w-4" />,
  music: <Music className="h-4 w-4" />,
  scissors: <Scissors className="h-4 w-4" />,
  sparkles: <Sparkles className="h-4 w-4" />,
  palette: <Palette className="h-4 w-4" />,
};

export function InteractiveThinkingPanel({
  thoughts,
  questions,
  isThinking,
  onQuestionAnswer,
  className,
}: InteractiveThinkingPanelProps) {
  const [expandedThoughts, setExpandedThoughts] = useState(true);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  if (!isThinking && thoughts.length === 0 && questions.length === 0) return null;

  const handleAnswer = (questionId: string, answer: string) => {
    setAnsweredQuestions((prev) => new Set([...prev, questionId]));
    setCustomAnswers((prev) => ({ ...prev, [questionId]: answer }));
    onQuestionAnswer?.(questionId, answer);
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/5 to-transparent border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-2 w-2 rounded-full",
            isThinking ? "bg-primary animate-pulse" : "bg-green-500"
          )} />
          <span className="text-sm font-semibold">
            {isThinking ? "Director is thinking..." : "Director's Plan"}
          </span>
        </div>
        {thoughts.length > 0 && (
          <button
            onClick={() => setExpandedThoughts(!expandedThoughts)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expandedThoughts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Thinking Stream */}
      {expandedThoughts && thoughts.length > 0 && (
        <div className="px-4 py-3 space-y-2 border-b border-border">
          {thoughts.map((thought, i) => {
            const isLatest = i === thoughts.length - 1 && isThinking;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 text-sm transition-all duration-300",
                  isLatest ? "opacity-100" : "opacity-70"
                )}
              >
                <div className={cn(
                  "mt-0.5 p-1.5 rounded-lg shrink-0",
                  isLatest ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {ICONS[thought.icon] || <Brain className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "leading-relaxed",
                    isLatest ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {thought.text}
                  </p>
                </div>
                {isLatest && (
                  <div className="shrink-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                )}
              </div>
            );
          })}
          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <div className="flex gap-1">
                <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-1 w-1 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              Processing...
            </div>
          )}
        </div>
      )}

      {/* Clarifying Questions */}
      {questions.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <MessageCircle className="h-3 w-3" />
            Quick Questions
          </div>
          {questions.map((q) => {
            const isAnswered = answeredQuestions.has(q.id);
            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-lg border p-3 transition-all",
                  isAnswered
                    ? "border-green-500/30 bg-green-500/5"
                    : q.impact === "critical"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-muted/20"
                )}
              >
                <p className="text-sm text-foreground/90 mb-2">{q.question}</p>
                {isAnswered ? (
                  <div className="flex items-center gap-1 text-xs text-green-500">
                    <Check className="h-3 w-3" />
                    {customAnswers[q.id] || "Noted"}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {q.type === "suggestion" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleAnswer(q.id, "Yes, do it")}
                        >
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleAnswer(q.id, "Skip")}
                        >
                          Skip
                        </Button>
                      </>
                    )}
                    {q.type === "clarification" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleAnswer(q.id, "Use your best judgment")}
                      >
                        Your call
                      </Button>
                    )}
                    {q.type === "requirement" && (
                      <span className="text-xs text-red-400">Required to proceed</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
