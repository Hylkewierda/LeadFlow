import { CheckCircle2, ArrowLeft, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { useWorkflow } from "../components/WorkflowContext";

export default function WorkflowActivated() {
  const { workflowRunning, activeWorkflowName, endWorkflow } = useWorkflow();
  const navigate = useNavigate();

  const handleCancel = () => {
    endWorkflow("");
    navigate(createPageUrl("Home"));
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 pt-16 pb-8">
      <div className="w-full max-w-md text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Success icon */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
            className="w-20 h-20 rounded-[22px] bg-accent flex items-center justify-center mx-auto mb-8 accent-glow"
          >
            <CheckCircle2 className="w-9 h-9 text-white" strokeWidth={2} />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-[22px] font-bold tracking-tight text-foreground mb-2"
          >
            Workflow geactiveerd
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-muted-foreground text-[13px] mb-2"
          >
            Het kan even duren voordat de workflow klaar is
          </motion.p>

          {workflowRunning && activeWorkflowName && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-muted-foreground/60 text-[11px] mb-10"
            >
              {activeWorkflowName} is actief
            </motion.p>
          )}

          {!workflowRunning && !activeWorkflowName && <div className="mb-10" />}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="flex flex-col items-center gap-3"
          >
            <Link
              to={createPageUrl("Home")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background text-[13px] font-semibold transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              Nieuwe workflow starten
            </Link>

            {workflowRunning && (
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/8 transition-all duration-200 active:scale-[0.98]"
              >
                <XCircle className="w-3.5 h-3.5" />
                Workflow annuleren
              </button>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
