import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { toast } from "sonner";

const WorkflowContext = createContext(null);
const STORAGE_KEY = "workflow_running_state";
const WORKFLOW_TIMEOUT_MS = 10 * 60 * 1000; // 10 minuten

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { workflowRunning: false, activeWorkflowName: "", startedAt: null };
    const parsed = JSON.parse(stored);
    // Auto-timeout: als workflow langer dan 10 min geleden is gestart, reset
    if (parsed.workflowRunning && parsed.startedAt) {
      const elapsed = Date.now() - parsed.startedAt;
      if (elapsed > WORKFLOW_TIMEOUT_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return { workflowRunning: false, activeWorkflowName: "", startedAt: null };
      }
    }
    return parsed;
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
  const timeoutRef = useRef(null);

  // Auto-timeout timer: reset workflow als het te lang duurt
  useEffect(() => {
    if (workflowRunning && initial.startedAt) {
      const remaining = WORKFLOW_TIMEOUT_MS - (Date.now() - initial.startedAt);
      if (remaining <= 0) {
        endWorkflow(null, true);
      } else {
        timeoutRef.current = setTimeout(() => endWorkflow(null, true), remaining);
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startWorkflow = (name) => {
    const now = Date.now();
    setWorkflowRunning(true);
    setActiveWorkflowName(name);
    activeNameRef.current = name;
    saveState({ workflowRunning: true, activeWorkflowName: name, startedAt: now });

    // Start timeout timer
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => endWorkflow(null, true), WORKFLOW_TIMEOUT_MS);
  };

  const endWorkflow = (completedName, timedOut = false) => {
    const name = completedName || activeNameRef.current;
    setWorkflowRunning(false);
    setActiveWorkflowName("");
    activeNameRef.current = "";
    saveState({ workflowRunning: false, activeWorkflowName: "", startedAt: null });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (timedOut && name) {
      toast.error(`${name} heeft te lang geduurd en is gestopt`);
    } else if (name) {
      toast.success(`${name} is klaar!`);
    }
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
