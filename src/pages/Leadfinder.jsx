import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Radar, FileSpreadsheet, ExternalLink, Loader2, SearchX, BookOpen } from "lucide-react";
import { createPageUrl } from "../utils";
import {
  listCandidates,
  qualifyCandidate,
  disqualifyCandidate,
  resetCandidate,
  listRecentRuns,
  startRun,
  cancelRun,
} from "@/lib/leadfinder/data.js";
import { CandidateCard } from "@/components/leadfinder/CandidateCard.jsx";
import { StatusFilter } from "@/components/leadfinder/StatusFilter.jsx";
import { RunsStrip } from "@/components/leadfinder/RunsStrip.jsx";
import { ScopeSteeringCard } from "@/components/leadfinder/ScopeSteeringCard";
import { PostScrapeCard } from "@/components/leadfinder/PostScrapeCard";
import { PostAnalysisPanel } from "@/components/leadfinder/PostAnalysisPanel";

// Qualified-leads overview Google Sheet (gevuld via de auto-export bij Qualify).
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/130dUCwgzNuX1okPHTWzpxM2N-xs0jR1ufDimeiBDBLw/edit?gid=0#gid=0";

const ALL_STATUSES = ["new", "rediscovered", "qualified", "disqualified"];

const EASING = [0.22, 1, 0.36, 1];
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASING } },
};

export default function Leadfinder() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [statuses, setStatuses] = useState(["new", "rediscovered"]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const isRunning = useMemo(() => runs.some((r) => r.status === "running"), [runs]);

  const latestPostsRunId = useMemo(() => {
    const r = runs.find((x) => x.triggered_by === "cloud-ui-posts");
    return r ? r.id : null;
  }, [runs]);

  const reload = useCallback(async () => {
    const [cands, rs] = await Promise.all([listCandidates(), listRecentRuns(5)]);
    setCandidates(cands);
    setRuns(rs);
  }, []);

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  useEffect(() => {
    if (!isRunning) return;
    const startedAt = Date.now();
    const MAX = 10 * 60 * 1000;
    const id = setInterval(async () => {
      if (Date.now() - startedAt > MAX) {
        clearInterval(id);
        return;
      }
      await reload();
    }, 3000);
    return () => clearInterval(id);
  }, [isRunning, reload]);

  useEffect(() => {
    if (!isRunning) setCancelling(false);
  }, [isRunning]);

  const counts = useMemo(() => {
    const acc = { new: 0, rediscovered: 0, qualified: 0, disqualified: 0 };
    for (const c of candidates) acc[c.status]++;
    return acc;
  }, [candidates]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return candidates
      .filter((c) => statuses.length === 0 || statuses.includes(c.status))
      .filter((c) => {
        if (!needle) return true;
        const p = c.linkedin_profile || {};
        return [p.name, p.role, p.headline, p.company, p.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      });
  }, [candidates, statuses, search]);

  async function handleQualify(id) {
    const updated = await qualifyCandidate(id);
    setCandidates((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }
  async function handleDisqualify(id, reason, note) {
    const updated = await disqualifyCandidate(id, reason, note);
    setCandidates((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }
  async function handleReset(id) {
    const updated = await resetCandidate(id);
    setCandidates((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }
  async function handleStartRun() {
    try {
      await startRun();
      await reload();
    } catch (err) {
      alert(`Kon geen run starten: ${err.message}`);
    }
  }
  async function handleCancelRun() {
    const running = runs.find((r) => r.status === "running");
    if (!running) return;
    setCancelling(true);
    try {
      await cancelRun(running.id);
    } catch (err) {
      console.error("cancelRun failed:", err);
      setCancelling(false);
    }
  }
  async function handleScrapePosts(urls) {
    try {
      await startRun(urls);
      await reload();
    } catch (err) {
      alert(`Kon posts niet scrapen: ${err.message}`);
    }
  }

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <motion.div
        className="w-full max-w-lg flex flex-col gap-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.header
          variants={item}
          className="flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 ring-1 ring-emerald-600/15">
              <Radar className="h-5 w-5 text-emerald-700" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] font-bold leading-none tracking-tight text-foreground">
                Leadfinder
              </h1>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                kb/actuals
              </span>
            </div>
          </div>

          {/* Open qualified-leads Sheet */}
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-600/20 bg-emerald-600/10 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition-all duration-200 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:accent-glow"
            title="Open de qualified-leads Google Sheet"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Qualified leads</span>
            <span className="sm:hidden">Sheet</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </a>
        </motion.header>

        {loading ? (
          <motion.div
            variants={item}
            className="glass-card flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
          >
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
            <span className="text-sm text-muted-foreground">Candidates laden…</span>
          </motion.div>
        ) : (
          <>
            <motion.div variants={item}>
              <RunsStrip runs={runs} isRunning={isRunning} onStart={handleStartRun} onCancel={handleCancelRun} cancelling={cancelling} />
            </motion.div>
            <motion.div variants={item}>
              <PostScrapeCard isRunning={isRunning} onScrape={handleScrapePosts} />
            </motion.div>
            <motion.div variants={item}>
              <PostAnalysisPanel runId={latestPostsRunId} isRunning={isRunning} />
            </motion.div>

            <motion.div variants={item}>
              <ScopeSteeringCard />
            </motion.div>

            <motion.div variants={item}>
              <button
                onClick={() => navigate(createPageUrl("KnowledgeBase"))}
                className="w-full glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-foreground/[0.06] flex items-center justify-center group-hover:bg-accent transition-colors">
                    <BookOpen className="w-4 h-4 text-foreground/60 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">Knowledge base</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Scherp aan wat de leadfinder over Actuals weet</p>
                  </div>
                </div>
              </button>
            </motion.div>

            <motion.div
              variants={item}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <StatusFilter value={statuses} onChange={setStatuses} counts={counts} />
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" aria-hidden />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek naam, bedrijf, rol…"
                  className="block w-full rounded-xl border border-white/40 bg-white/50 py-2 pl-9 pr-3 text-sm shadow-sm backdrop-blur transition placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:bg-white/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </motion.div>

            <motion.div
              variants={item}
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span>
                <span className="font-semibold text-foreground">{visible.length}</span> van{" "}
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => setStatuses(ALL_STATUSES)}
                className="rounded font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Toon alle statussen
              </button>
            </motion.div>

            {visible.length === 0 ? (
              <motion.div
                variants={item}
                className="glass-card flex flex-col items-center gap-2 rounded-2xl px-6 py-14 text-center"
              >
                <SearchX className="h-6 w-6 text-muted-foreground/40" aria-hidden />
                <span className="text-sm text-muted-foreground">
                  Geen candidates matchen de huidige filters.
                </span>
              </motion.div>
            ) : (
              <motion.ul variants={item} className="flex flex-col gap-3">
                {visible.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onQualify={handleQualify}
                    onDisqualify={handleDisqualify}
                    onReset={handleReset}
                  />
                ))}
              </motion.ul>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
