import { formatRelative } from "@/lib/leadfinder/format";
import { CheckCircle2, CircleAlert, Loader2, Play } from "lucide-react";

export function RunsStrip({ runs, isRunning, onStart }) {
  return (
    <div className="glass-card flex items-center gap-3 px-4 py-3 text-sm">
      <button
        type="button"
        onClick={onStart}
        disabled={isRunning}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Running…
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" aria-hidden />
            Start run
          </>
        )}
      </button>
      {runs.length === 0 ? (
        <span className="text-xs text-slate-400">
          No runs yet. Click &quot;Start run&quot; to discover candidates.
        </span>
      ) : (
        <>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
            Recent runs
          </span>
          <div className="flex items-center gap-2 overflow-x-auto">
            {runs.map((r) => {
              const Icon =
                r.status === "completed"
                  ? CheckCircle2
                  : r.status === "failed"
                    ? CircleAlert
                    : Loader2;
              const tone =
                r.status === "completed"
                  ? "text-emerald-600"
                  : r.status === "failed"
                    ? "text-rose-600"
                    : "text-slate-500";
              const spin = r.status === "running" ? "animate-spin" : "";
              return (
                <div
                  key={r.id}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-xs"
                >
                  <Icon className={`w-3.5 h-3.5 ${tone} ${spin}`} aria-hidden />
                  <span className="font-medium text-slate-700">
                    {formatRelative(r.started_at)}
                  </span>
                  {r.counts && (
                    <span className="text-slate-500">
                      {r.counts.inserted} new · {r.counts.deduped} unique
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
