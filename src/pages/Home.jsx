import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Zap, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkflow } from "../components/WorkflowContext";

const WEBHOOK_URL = "https://hylkewnl.app.n8n.cloud/webhook/b77e71d3-03ea-4a2a-8fba-f3c3ff857b07";
const DAILY_LIMIT = 5;

const WORKFLOW_MODES = [
  { id: "AllPosts", storageId: "all_posts", label: "All Posts", description: "Analyseer alle posts", sheetUrl: null },
  { id: "SpecificPosts", storageId: "specific_posts_v2", label: "Specific Posts", description: "Selectieve post analyse", sheetUrl: "https://docs.google.com/spreadsheets/d/1VUHdVrfQbsL8nYMoD1nhAq1ayFFpy77W3Eu7je1CdAc" },
  { id: "Campaigns", storageId: "campaigns", label: "Campaigns", description: "Campaign leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1UJvwFAZQJ6q_VRp3_MjphJ3bbdAp-JNhe1I08iKlxxU" },
  { id: "CommentPosts", storageId: "comment_posts", label: "Comment Posts", description: "Comment engagement", sheetUrl: "https://docs.google.com/spreadsheets/d/1y4gPlMXPCSn54FyRc3vpMSDfI-L46LqlHaxmOZacJZo" },
];

// Helper functions voor dag tracking
const getCurrentDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getStorageKey = (storageId) => {
  const currentDate = getCurrentDate(new Date());
  return `limiter_${storageId}_${currentDate}`;
};

const getUsageCount = (storageId) => {
  const key = getStorageKey(storageId);
  const count = localStorage.getItem(key);
  return count ? parseInt(count, 10) : 0;
};

const incrementUsage = (storageId) => {
  const key = getStorageKey(storageId);
  const current = getUsageCount(storageId);
  localStorage.setItem(key, String(current + 1));
};

const cleanupOldDays = () => {
  const currentDate = getCurrentDate(new Date());
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('limiter_') && !key.includes(currentDate)) {
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
    
    // Load usage counts
    const counts = {};
    WORKFLOW_MODES.forEach(mode => {
      counts[mode.storageId] = getUsageCount(mode.storageId);
    });
    setUsageCounts(counts);
  }, []);

  const triggerWorkflow = async (mode) => {
    const workflowMode = WORKFLOW_MODES.find(m => m.id === mode);
    const currentUsage = getUsageCount(workflowMode.storageId);

    // Check if limit is reached
    if (currentUsage >= DAILY_LIMIT) {
      setError(`⛔ Dagelijks limiet bereikt voor ${workflowMode.label} (${DAILY_LIMIT}/${DAILY_LIMIT}). Probeer het morgen opnieuw.`);
      return;
    }

    startWorkflow(workflowMode.label);
    setIsLoading(mode);
    setError(null);
    setWarningMessage(null);

    // Show warning for run 4 and 5
    if (currentUsage === DAILY_LIMIT - 2) {
      setWarningMessage(`⚠️ Let op: je hebt nog 1 run over vandaag voor ${workflowMode.label}.`);
    } else if (currentUsage === DAILY_LIMIT - 1) {
      setWarningMessage(`⚠️ Dit is je laatste run vandaag voor ${workflowMode.label}.`);
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        throw new Error("Workflow kon niet worden gestart");
      }

      // Increment usage count
      incrementUsage(workflowMode.storageId);
      setUsageCounts(prev => ({
        ...prev,
        [workflowMode.storageId]: currentUsage + 1
      }));

      // Navigate to WorkflowActivated page on success
      navigate(createPageUrl("WorkflowActivated"));
    } catch (err) {
      setError("Er ging iets mis. Controleer de webhook URL.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6">
      <div className="w-full max-w-md flex-1 flex flex-col justify-center">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-16"
        >
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_68f11e15150826cffc22f69c/d719759d4_Actuals.png" 
            alt="Actuals" 
            className="h-12 object-contain"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold text-black mb-2">Lead Qualifier</h1>
            <p className="text-black/60 text-sm">Selecteer een workflow om te starten</p>
          </div>

          {/* Warning Message */}
          {warningMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl text-center"
            >
              <p className="text-orange-700 text-sm font-medium">{warningMessage}</p>
            </motion.div>
          )}

          {/* Workflow Buttons */}
          <div className="space-y-4">
            {WORKFLOW_MODES.map((mode, index) => {
              const usage = usageCounts[mode.storageId] || 0;
              const isLimitReached = usage >= DAILY_LIMIT;
              const isDisabled = isLoading !== null || isLimitReached || workflowRunning;
              
              return (
                <motion.div
                  key={mode.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex gap-2">
                    <Button
                      onClick={() => triggerWorkflow(mode.id)}
                      disabled={isDisabled}
                      className={`flex-1 h-16 rounded-xl flex items-center justify-between px-6 group transition-all duration-300 ${
                        isLimitReached || workflowRunning
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-black hover:bg-black/90 text-white hover:translate-x-1'
                      }`}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-base">{mode.label}</span>
                        <span className={`text-xs ${isLimitReached ? 'text-gray-400' : 'text-white/60'}`}>
                          {mode.description}
                        </span>
                      </div>
                      {isLimitReached ? (
                        <Lock className="w-5 h-5" />
                      ) : isLoading === mode.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Zap className="w-5 h-5 text-[#00FF33] opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </Button>
                    {mode.sheetUrl && (
                      <a
                        href={mode.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-16 h-16 bg-[#00FF33] hover:bg-[#00FF33]/80 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105"
                      >
                        <ExternalLink className="w-5 h-5 text-black" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1.5 ml-1 text-xs text-black/40">
                    {usage}/{DAILY_LIMIT} gebruikt vandaag
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Active Workflow Message */}
          {workflowRunning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-center"
            >
              <p className="text-orange-700 text-sm font-medium">⏳ {activeWorkflowName} is actief. Wacht tot deze klaar is.</p>
              <button
                onClick={() => { endWorkflow(""); }}
                className="mt-3 text-xs text-orange-500 hover:text-orange-700 underline underline-offset-2 transition-colors"
              >
                Reset
              </button>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-center"
            >
              <p className="text-red-600 text-sm">{error}</p>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="w-full text-center pb-6 text-black/30 text-xs"
      >
        For Actuals
      </motion.div>
    </div>
  );
}