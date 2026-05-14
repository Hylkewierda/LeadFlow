import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { ExternalLink, Loader2, Zap, Lock, Activity, Radar } from "lucide-react";
import { motion } from "framer-motion";
import { useWorkflow } from "../components/WorkflowContext";

const WEBHOOK_URL = "https://hylkewnl.app.n8n.cloud/webhook/b77e71d3-03ea-4a2a-8fba-f3c3ff857b07";
const DAILY_LIMIT = 5;

const WORKFLOW_MODES = [
  { id: "AllPosts", storageId: "all_posts", label: "All Posts", description: "Analyseer alle posts", sheetUrl: null },
  { id: "SpecificPosts", storageId: "specific_posts_v2", label: "Specific Posts", description: "Selectieve post analyse", sheetUrl: "https://docs.google.com/spreadsheets/d/1VUHdVrfQbsL8nYMoD1nhAq1ayFFpy77W3Eu7je1CdAc" },
  { id: "Campaigns", storageId: "campaigns", label: "Campaigns", description: "Campaign leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1UJvwFAZQJ6q_VRp3_MjphJ3bbdAp-JNhe1I08iKlxxU" },
  { id: "CommentPosts", storageId: "comment_posts", label: "Comment Posts", description: "Comment engagement", sheetUrl: "https://docs.google.com/spreadsheets/d/1y4gPlMXPCSn54FyRc3vpMSDfI-L46LqlHaxmOZacJZo" },
];

const getCurrentDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getStorageKey = (storageId) => `limiter_${storageId}_${getCurrentDate()}`;
const getUsageCount = (storageId) => parseInt(localStorage.getItem(getStorageKey(storageId)) || "0", 10);
const incrementUsage = (storageId) => {
  localStorage.setItem(getStorageKey(storageId), String(getUsageCount(storageId) + 1));
};

const cleanupOldDays = () => {
  const currentDate = getCurrentDate();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('limiter_') && !key.includes(currentDate)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
};

export default function Home() {
  const navigate = useNavigate();
  const { workflowRunning, activeWorkflowName, startWorkflow, endWorkflow } = useWorkflow();
  const [isLoading, setIsLoading] = useState(null);
  const [error, setError] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);
  const [usageCounts, setUsageCounts] = useState({});

  useEffect(() => {
    cleanupOldDays();
    const counts = {};
    WORKFLOW_MODES.forEach(mode => {
      counts[mode.storageId] = getUsageCount(mode.storageId);
    });
    setUsageCounts(counts);
  }, []);

  const triggerWorkflow = async (mode) => {
    const workflowMode = WORKFLOW_MODES.find(m => m.id === mode);
    const currentUsage = getUsageCount(workflowMode.storageId);

    if (currentUsage >= DAILY_LIMIT) {
      setError(`Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}).`);
      return;
    }

    startWorkflow(workflowMode.label);
    setIsLoading(mode);
    setError(null);
    setWarningMessage(null);

    if (currentUsage === DAILY_LIMIT - 2) {
      setWarningMessage(`Nog 1 run over vandaag voor ${workflowMode.label}`);
    } else if (currentUsage === DAILY_LIMIT - 1) {
      setWarningMessage(`Laatste run vandaag voor ${workflowMode.label}`);
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) throw new Error("Workflow kon niet worden gestart");

      incrementUsage(workflowMode.storageId);
      setUsageCounts(prev => ({
        ...prev,
        [workflowMode.storageId]: currentUsage + 1
      }));

      navigate(createPageUrl("WorkflowActivated"));
    } catch {
      endWorkflow("");
      setError("Er ging iets mis. Controleer de webhook URL.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">
            Lead Qualifier
          </h1>
          <p className="text-muted-foreground text-[14px] mt-1 italic">
            From connection to qualified lead
          </p>
          <p className="text-muted-foreground text-[13px] mt-2">
            Selecteer een workflow om te starten
          </p>
        </motion.div>

        {/* Warning */}
        {warningMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 px-4 py-3 bg-amber-50/80 border border-amber-200/60 rounded-2xl"
          >
            <p className="text-amber-700 text-[13px] font-medium">{warningMessage}</p>
          </motion.div>
        )}

        {/* Workflow cards */}
        <div className="space-y-3">
          {WORKFLOW_MODES.map((mode, index) => {
            const usage = usageCounts[mode.storageId] || 0;
            const isLimitReached = usage >= DAILY_LIMIT;
            const isDisabled = isLoading !== null || isLimitReached || workflowRunning;
            const progress = (usage / DAILY_LIMIT) * 100;

            return (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex gap-2.5">
                  {/* Main workflow button */}
                  <button
                    onClick={() => triggerWorkflow(mode.id)}
                    disabled={isDisabled}
                    className={`flex-1 glass-card rounded-2xl p-4 text-left transition-all duration-300 group ${
                      isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-foreground">{mode.label}</h3>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{mode.description}</p>
                      </div>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        isLimitReached
                          ? 'bg-muted'
                          : 'bg-foreground/[0.06] group-hover:bg-accent group-hover:accent-glow'
                      }`}>
                        {isLimitReached ? (
                          <Lock className="w-4 h-4 text-muted-foreground" />
                        ) : isLoading === mode.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                        ) : (
                          <Zap className={`w-4 h-4 transition-colors duration-300 ${
                            isDisabled ? 'text-muted-foreground' : 'text-foreground/60 group-hover:text-white'
                          }`} />
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            isLimitReached ? 'bg-destructive/60' : 'bg-accent'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ delay: index * 0.08 + 0.3, duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                        {usage}/{DAILY_LIMIT}
                      </span>
                    </div>
                  </button>

                  {/* Sheet link */}
                  {mode.sheetUrl && (
                    <a
                      href={mode.sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-14 glass-card rounded-2xl flex items-center justify-center transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group/link"
                    >
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover/link:text-accent transition-colors" />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Leadfinder card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: WORKFLOW_MODES.length * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 glass-card p-6 cursor-pointer accent-glow hover:scale-[1.01] transition-transform"
          onClick={() => navigate(createPageUrl("Leadfinder"))}
        >
          <div className="flex items-start gap-3">
            <Radar className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold">Leadfinder</h3>
              <p className="text-sm text-slate-500">
                KB-gestuurde lead-discovery via LinkedIn.
                Bekijk en triage candidates uit lopende runs.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Active workflow banner */}
        {workflowRunning && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 glass-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-accent animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-foreground">{activeWorkflowName} is actief</p>
                <p className="text-[11px] text-muted-foreground">Wacht tot deze klaar is</p>
              </div>
              <button
                onClick={() => endWorkflow("")}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Reset
              </button>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 px-4 py-3 bg-destructive/8 border border-destructive/15 rounded-2xl"
          >
            <p className="text-destructive text-[13px] font-medium">{error}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
