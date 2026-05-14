import { MessageSquare, Target, Layers } from "lucide-react";

const LABELS = {
  content: "Content signal",
  competitor_engagement: "Competitor engagement",
  combined: "Combined",
};

export function SignalTypeIcon({ type }) {
  const Icon = type === "content" ? MessageSquare : type === "competitor_engagement" ? Target : Layers;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-500"
      title={LABELS[type]}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {LABELS[type]}
    </span>
  );
}
