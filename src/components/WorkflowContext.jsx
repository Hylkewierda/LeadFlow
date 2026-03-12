import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const WorkflowContext = createContext(null);
const STORAGE_KEY = "workflow_running_state";

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { workflowRunning: false, activeWorkflowName: "" };
  } catch {
    return { workflowRunning: false, activeWorkflowName: "" };
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

  const startWorkflow = (name) => {
    setWorkflowRunning(true);
    setActiveWorkflowName(name);
    activeNameRef.current = name;
    saveState({ workflowRunning: true, activeWorkflowName: name });
  };

  const endWorkflow = (completedName) => {
    const name = completedName || activeNameRef.current;
    setWorkflowRunning(false);
    setActiveWorkflowName("");
    activeNameRef.current = "";
    saveState({ workflowRunning: false, activeWorkflowName: "" });
    toast.success(`✅ ${name} is klaar!`);
  };

  // Subscribe to WorkflowStatus entity for real-time completion signals
  useEffect(() => {
    const unsubscribe = base44.entities.WorkflowStatus.subscribe((event) => {
      if (event.type === "create" && event.data?.status === "completed") {
        const wfName = event.data?.workflow_name || activeNameRef.current;
        endWorkflow(wfName);
        // Clean up the record
        base44.entities.WorkflowStatus.delete(event.id).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  return (
    <WorkflowContext.Provider value={{ workflowRunning, activeWorkflowName, startWorkflow, endWorkflow }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}