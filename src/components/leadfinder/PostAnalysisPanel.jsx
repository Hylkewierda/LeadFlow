import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { listPostAnalyses } from "@/lib/leadfinder/data";

const VOLUME_TONE = {
  hoog: "text-emerald-600",
  gemiddeld: "text-amber-600",
  laag: "text-slate-400",
};

export function PostAnalysisPanel({ runId, isRunning }) {
  const [analyses, setAnalyses] = useState([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let active = true;
    if (!runId) {
      setAnalyses([]);
      return;
    }
    listPostAnalyses(runId)
      .then((rows) => {
        if (active) setAnalyses(rows);
      })
      .catch(() => {
        if (active) setAnalyses([]);
      });
    return () => {
      active = false;
    };
    // Re-fetch when the run flips running→completed so analyses appear without a reload.
  }, [runId, isRunning]);

  if (!runId || analyses.length === 0) return null;

  return (
    <div className="glass-card px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileText className="h-3.5 w-3.5" aria-hidden />
        Concurrent-analyse ({analyses.length})
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-3">
          {analyses.map((a) => (
            <li key={a.id} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <a
                  href={a.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs font-medium text-emerald-700 hover:underline"
                >
                  {a.post_url}
                </a>
                <span className={`shrink-0 text-[11px] font-medium ${VOLUME_TONE[a.summary?.engagement_volume] ?? "text-slate-400"}`}>
                  {a.summary?.engagement_volume ?? "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-700">{a.summary?.topic}</p>
              {a.summary?.hook && (
                <p className="mt-0.5 text-[11px] text-slate-500">Hook: {a.summary.hook}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
