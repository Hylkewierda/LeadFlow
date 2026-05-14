import { formatScore, scoreTone } from "@/lib/leadfinder/format";

export function ScorePill({ score }) {
  const tone = scoreTone(score);
  const styles =
    tone === "hot"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : tone === "warm"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles}`}
      title={`pre-score ${score.toFixed(2)}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
      {formatScore(score)}
    </span>
  );
}
