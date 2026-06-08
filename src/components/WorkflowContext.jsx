import { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const WorkflowContext = createContext(null);
const STORAGE_KEY = "workflow_running_state";
const POLL_INTERVAL_MS = 10_000; // Poll elke 10 seconden

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { workflowRunning: false, activeWorkflowName: "", runId: null };
    return JSON.parse(stored);
  } catch {
    return { workflowRunning: false, activeWorkflowName: "", runId: null };
  }
};

const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export function WorkflowProvider({ children }) {
  const initial = loadState();
  const [workflowRunning, setWorkflowRunning] = useState(initial.workflowRunning);
  const [activeWorkflowName, setActiveWorkflowName] = useState(initial.activeWorkflowName);
  const activeNameRef = useRef(initial.activeWorkflowName);
  const runIdRef = useRef(initial.runId);
  const pollRef = useRef(null);

  const endWorkflow = useCallback((completedName, result) => {
    const name = completedName || activeNameRef.current;
    setWorkflowRunning(false);
    setActiveWorkflowName("");
    activeNameRef.current = "";
    runIdRef.current = null;
    saveState({ workflowRunning: false, activeWorkflowName: "", runId: null });

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (result && result.failed) {
      toast.error(`${name || "Workflow"} is mislukt${result.error ? `: ${result.error}` : ""}`);
    } else if (name) {
      const added = result && typeof result.appended === "number" ? result.appended : null;
      toast.success(
        added !== null
          ? `${name} is klaar! ${added} ${added === 1 ? "rij" : "rijen"} toegevoegd`
          : `${name} is klaar!`
      );
    }
  }, []);

  const pollStatus = useCallback(async () => {
    const name = activeNameRef.current;
    const runId = runIdRef.current;
    if (!name || !runId) return;

    try {
      const res = await fetch(`/api/workflows?run_id=${encodeURIComponent(runId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "completed") {
        endWorkflow(name, { appended: data.counts?.appended });
      } else if (data.status === "failed") {
        endWorkflow(name, { failed: true, error: data.error });
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [endWorkflow]);

  // Start polling wanneer workflow actief is
  useEffect(() => {
    if (workflowRunning && activeNameRef.current) {
      pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
      // Direct eerste poll
      pollStatus();
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [workflowRunning, pollStatus]);

  const startWorkflow = (name, runId = null) => {
    setWorkflowRunning(true);
    setActiveWorkflowName(name);
    activeNameRef.current = name;
    runIdRef.current = runId;
    saveState({ workflowRunning: true, activeWorkflowName: name, runId });
  };

  return (
    <WorkflowContext.Provider value={{ workflowRunning, activeWorkflowName, startWorkflow, endWorkflow }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}
