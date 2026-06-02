import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import {
  startLookalikeSearch,
  getLookalikeSearch,
  exportLookalikeSearchToSheet,
  LOOKALIKE_SHEET_URL,
} from "@/lib/lookalike/data.js";

const EASING = [0.22, 1, 0.36, 1];

const STAGES = [
  { key: "pending", label: "Wachten op worker" },
  { key: "scraping", label: "LinkedIn-anchors scrapen" },
  { key: "generating_playbook", label: "Opus zoekt patronen" },
  { key: "searching", label: "Profielen zoeken via Apify" },
  { key: "scoring", label: "Embedden + LLM-scoring" },
  { key: "completed", label: "Klaar" },
];

const STORAGE_KEY = "lookalike_active_search_id";

function StageRow({ stage, currentStatus }) {
  const stageIdx = STAGES.findIndex((s) => s.key === stage.key);
  const currentIdx = STAGES.findIndex((s) => s.key === currentStatus);
  const failed = currentStatus === "failed";
  const isCurrent = stage.key === currentStatus;
  const isDone = !failed && currentIdx > stageIdx;
  const isPending = !failed && currentIdx < stageIdx;

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          isDone
            ? "bg-emerald-600 text-white"
            : isCurrent
              ? "bg-emerald-100 text-emerald-700"
              : "bg-muted text-muted-foreground/50"
        }`}
      >
        {isDone ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isCurrent ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="text-[10px] font-bold">{stageIdx + 1}</span>
        )}
      </div>
      <span
        className={`text-[13px] ${
          isDone || isCurrent ? "text-foreground font-medium" : "text-muted-foreground/60"
        } ${isPending ? "text-muted-foreground/40" : ""}`}
      >
        {stage.label}
      </span>
    </div>
  );
}

export default function LookalikeSearch() {
  const [urlsText, setUrlsText] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [activeSearchId, setActiveSearchId] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [search, setSearch] = useState(null);
  const [searchError, setSearchError] = useState(null);

  // Auto-export latch — fire exactly once when status flips to 'completed'.
  const autoExportFiredRef = useRef(false);
  const [exportState, setExportState] = useState({ status: "idle", exported: 0, error: null });

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const urls = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setSubmitError("Plak minstens 1 LinkedIn-profiel-URL.");
      return;
    }
    setSubmitting(true);
    try {
      const { searchId } = await startLookalikeSearch({ urls, name: name || null });
      localStorage.setItem(STORAGE_KEY, searchId);
      setActiveSearchId(searchId);
      setSearch(null);
      autoExportFiredRef.current = false;
      setExportState({ status: "idle", exported: 0, error: null });
    } catch (err) {
      setSubmitError(err.message || "Kon zoekopdracht niet starten.");
    } finally {
      setSubmitting(false);
    }
  }, [urlsText, name]);

  // Poll for status while the search is active.
  useEffect(() => {
    if (!activeSearchId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const row = await getLookalikeSearch(activeSearchId);
        if (cancelled) return;
        if (!row) {
          setSearchError("Search niet gevonden in database");
          return;
        }
        setSearchError(null);
        setSearch(row);
      } catch (e) {
        if (!cancelled) setSearchError(e.message);
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeSearchId]);

  // Auto-trigger the Sheet export when the search completes.
  useEffect(() => {
    if (!search || search.status !== "completed") return;
    if (autoExportFiredRef.current) return;
    autoExportFiredRef.current = true;
    (async () => {
      setExportState({ status: "running", exported: 0, error: null });
      try {
        const r = await exportLookalikeSearchToSheet(search.id);
        setExportState({ status: "done", exported: r.exported ?? 0, error: null });
      } catch (e) {
        setExportState({ status: "error", exported: 0, error: e.message });
      }
    })();
  }, [search]);

  const resetForNewSearch = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveSearchId(null);
    setSearch(null);
    setSearchError(null);
    setUrlsText("");
    setName("");
    autoExportFiredRef.current = false;
    setExportState({ status: "idle", exported: 0, error: null });
  }, []);

  const isTerminal = useMemo(
    () => search && (search.status === "completed" || search.status === "failed"),
    [search],
  );

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASING }}
          className="mb-6 flex items-start gap-3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 ring-1 ring-emerald-600/15">
            <Sparkles className="h-5 w-5 text-emerald-700" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">
              Lookalike search
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Plak 1+ LinkedIn-profiel-URLs als ICP-anker. Wij distilleren het archetype en zoeken naar soortgelijke profielen.
            </p>
          </div>
        </motion.header>

        {/* No active search → form */}
        {!activeSearchId && (
          <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASING }}
            className="glass-card rounded-2xl p-5 space-y-4"
            onSubmit={handleSubmit}
          >
            <div>
              <label className="block text-[12px] font-semibold text-foreground mb-1">
                Naam (optioneel)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. CFO-look-alikes Q3"
                className="w-full rounded-xl border border-input/60 bg-white/60 px-3.5 py-2.5 text-[14px] focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/15"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-foreground mb-1">
                LinkedIn-profiel-URLs <span className="text-muted-foreground font-normal">(één per regel)</span>
              </label>
              <textarea
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={"https://www.linkedin.com/in/voorbeeld-1\nhttps://www.linkedin.com/in/voorbeeld-2"}
                rows={6}
                className="w-full rounded-xl border border-input/60 bg-white/60 px-3.5 py-2.5 text-[13px] font-mono focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/15"
                disabled={submitting}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Kosten ≈ $1 per zoekopdracht (Apify + OpenAI + Anthropic). Duurt 3-6 min.
              </p>
            </div>
            {submitError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {submitError}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Zoekopdracht starten…
                </>
              ) : (
                <>
                  Start lookalike-search <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </motion.form>
        )}

        {/* Active search → status board */}
        {activeSearchId && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASING }}
            className="glass-card rounded-2xl p-5"
          >
            {searchError && (
              <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {searchError}
              </div>
            )}

            {search && (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Status
                    </p>
                    <h2 className="text-[18px] font-semibold text-foreground">
                      {search.name || "Naamloze zoekopdracht"}
                    </h2>
                  </div>
                  {search.status === "failed" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                      <XCircle className="h-3.5 w-3.5" /> failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {search.status === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {search.status}
                    </span>
                  )}
                </div>

                <div className="space-y-0 mb-4">
                  {STAGES.map((stg) => (
                    <StageRow key={stg.key} stage={stg} currentStatus={search.status} />
                  ))}
                </div>

                {/* Counts (populated mid-run + final) */}
                {(search.candidates_found > 0 || search.candidates_qualified > 0) && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Gevonden</p>
                      <p className="text-[18px] font-bold text-foreground">
                        {search.candidates_found}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] text-emerald-700">Qualified (≥ 50)</p>
                      <p className="text-[18px] font-bold text-emerald-700">
                        {search.candidates_qualified}
                      </p>
                    </div>
                  </div>
                )}

                {/* Error detail */}
                {search.error && (
                  <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {search.error}
                  </div>
                )}

                {/* Export status (only when completed) */}
                {search.status === "completed" && (
                  <div className="mb-4 rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-3 py-2.5 text-[12px]">
                    {exportState.status === "idle" && "Sheet-export wordt geprepareerd…"}
                    {exportState.status === "running" && (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-700" />
                        Pushen naar Sheet…
                      </span>
                    )}
                    {exportState.status === "done" && (
                      <span className="text-emerald-700">
                        ✓ {exportState.exported} rijen in de Sheet gezet
                      </span>
                    )}
                    {exportState.status === "error" && (
                      <span className="text-red-700">
                        Export gefaald: {exportState.error}
                      </span>
                    )}
                  </div>
                )}

                {/* Terminal actions */}
                {isTerminal && (
                  <div className="flex flex-col gap-2">
                    {search.status === "completed" && (
                      <a
                        href={LOOKALIKE_SHEET_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600/20 bg-emerald-600/10 px-3.5 py-2 text-[13px] font-semibold text-emerald-800 transition-all duration-200 hover:bg-emerald-600 hover:text-white"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Open lookalike Sheet
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={resetForNewSearch}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground/[0.06] px-3.5 py-2 text-[13px] font-semibold text-foreground transition-all duration-200 hover:bg-foreground/[0.10]"
                    >
                      Nieuwe zoekopdracht starten
                    </button>
                  </div>
                )}
              </>
            )}
            {!search && !searchError && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-[13px]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Status laden…
              </div>
            )}
          </motion.section>
        )}
      </div>
    </div>
  );
}
