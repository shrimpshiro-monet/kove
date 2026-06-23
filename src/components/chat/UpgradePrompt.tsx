import { Sparkles, Zap, ArrowRight } from "lucide-react";

export interface UpgradeCta {
  headline: string;
  body: string;
  action: string;
  url: string;
  currentTier: string;
}

export function UpgradePrompt({
  cta,
  onDismiss,
  onUpgrade,
}: {
  cta: UpgradeCta;
  onDismiss?: () => void;
  onUpgrade?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-pink-500/10 p-5 my-4 relative">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-amber-500/60 hover:text-amber-500 text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0 rounded-xl bg-amber-500/20 p-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-1">
            {cta.headline}
          </div>
          <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {cta.body}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={cta.url}
              onClick={onUpgrade}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition"
            >
              <Zap className="h-3 w-3" />
              {cta.action}
              <ArrowRight className="h-3 w-3" />
            </a>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition px-3 py-2"
              >
                Maybe later
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
