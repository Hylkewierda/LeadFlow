import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const WorkflowContext = createContext(null);
const STORAGE_KEY = "workflow_running_state";
const POLL_INTERVAL_MS = 10_000; // Poll elke 10 seconden

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { workflowRunning: false, activeWorkflowName: "", startedAt: null };
    return JSON.parse(stored);
  } catch {
    return { workflowRunning: false, activeWorkflowName: "", startedAt: null };
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
  const startedAtRef = useRef(initial.startedAt);
  const pollRef = useRef(null);

  const endWorkflow = useCallback((completedName) => {
    const name = completedName || activeNameRef.current;
    setWorkflowRunning(false);
    setActiveWorkflowName("");
    activeNameRef.current = "";
    startedAtRef.current = null;
    saveState({ workflowRunning: false, activeWorkflowName: "", startedAt: null });

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (name) {
      toast.success(`${name} is klaar!`);
    }
  }, []);

  const pollStatus = useCallback(async () => {
    const name = activeNameRef.current;
    const startedAt = startedAtRef.current;
    if (!name || !startedAt) return;

    try {
      const res = await fetch(`/api/workflow-status?workflow_name=${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === "completed" && data.completed_at > startedAt) {
        endWorkflow(name);
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

  const startWorkflow = (name) => {
    const now = Date.now();
    setWorkflowRunning(true);
    setActiveWorkflowName(name);
    activeNameRef.current = name;
    startedAtRef.current = now;
    saveState({ workflowRunning: true, activeWorkflowName: name, startedAt: now });
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
