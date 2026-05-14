import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import {
  listCandidates,
  qualifyCandidate,
  disqualifyCandidate,
  resetCandidate,
  listRecentRuns,
  startRun,
} from "@/lib/leadfinder/data.js";
import { CandidateCard } from "@/components/leadfinder/CandidateCard.jsx";
import { StatusFilter } from "@/components/leadfinder/StatusFilter.jsx";
import { RunsStrip } from "@/components/leadfinder/RunsStrip.jsx";

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
  const [candidates, setCandidates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [statuses, setStatuses] = useState(["new", "rediscovered"]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const isRunning = useMemo(() => runs.some((r) => r.status === "running"), [runs]);

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

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <motion.div
        className="w-full max-w-lg flex flex-col gap-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.header variants={item} className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Leadfinder</h1>
          <p className="text-xs font-mono text-slate-500">kb/actuals</p>
        </motion.header>

        {loading ? (
          <motion.div variants={item} className="glass-card px-6 py-10 text-center text-sm text-slate-500">
            Loading candidates…
          </motion.div>
        ) : (
          <>
            <motion.div variants={item}>
              <RunsStrip runs={runs} isRunning={isRunning} onStart={handleStartRun} />
            </motion.div>

            <motion.div variants={item} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <StatusFilter value={statuses} onChange={setStatuses} counts={counts} />
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, company, role…"
                  className="block w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </motion.div>

            <motion.div variants={item} className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {visible.length} of {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => setStatuses(ALL_STATUSES)}
                className="rounded text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Show all statuses
              </button>
            </motion.div>

            {visible.length === 0 ? (
              <motion.div variants={item} className="glass-card px-6 py-10 text-center text-sm text-slate-500">
                No candidates match the current filters.
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
