import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { useWorkflow } from "../components/WorkflowContext";

export default function WorkflowActivated() {
  const { workflowRunning } = useWorkflow();
  const navigate = useNavigate();

  // Als workflow klaar is (via toast + context reset), ga terug naar Home
  useEffect(() => {
    if (!workflowRunning) return;
  }, [workflowRunning]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="w-20 h-20 bg-[#00FF33] rounded-full flex items-center justify-center mx-auto mb-8"
          >
            <CheckCircle2 className="w-10 h-10 text-black" />
          </motion.div>

          <h2 className="text-2xl font-semibold text-black mb-2">Workflow Geactiveerd</h2>
          <p className="text-black/60 text-sm mb-10">Het kan even duren voordat de workflow klaar is</p>

          {/* Back Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Link to={createPageUrl("Home")}>
              <Button className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-xl font-medium transition-all duration-300">
                Nieuwe workflow starten
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-6 text-black/30 text-xs"
      >
        For Actuals
      </motion.div>
    </div>
  );
}