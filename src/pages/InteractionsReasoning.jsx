import React from "react";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export default function InteractionsReasoning() {
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold text-black mb-2">Interactions & Reasoning</h1>
            <p className="text-black/60 text-sm">Bekijk de resultaten van je workflows</p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <motion.a
              href="https://docs.google.com/spreadsheets/d/1pbEkpn9q6W9m4_ddOaCfzMqWvRENsTQJYA3duHMCA_c"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-center gap-3 font-medium transition-all duration-300 hover:translate-x-1"
            >
              <span>Post Interactions</span>
              <ExternalLink className="w-4 h-4" />
            </motion.a>

            <motion.a
              href="https://docs.google.com/spreadsheets/d/1EZUohOXUM_JWqXJzFRxjBiqrM3ghwpwmrxcjzHJFU_k/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-center gap-3 font-medium transition-all duration-300 hover:translate-x-1"
            >
              <span>Campaign Interactions</span>
              <ExternalLink className="w-4 h-4" />
            </motion.a>

            <motion.a
              href="https://docs.google.com/spreadsheets/d/1u_KRRxPS4R6icWIbOZK9qJ3x1oRpsw0jnF8C19FvPmg/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-center gap-3 font-medium transition-all duration-300 hover:translate-x-1"
            >
              <span>Comment Interactions</span>
              <ExternalLink className="w-4 h-4" />
            </motion.a>

            <motion.a
              href="https://docs.google.com/spreadsheets/d/1rlLCDAC_Q4VxeNRsl0d8lmqT0DngttkUuIlqIgrRmBM/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-center gap-3 font-medium transition-all duration-300 hover:translate-x-1"
            >
              <span>Reasoning</span>
              <ExternalLink className="w-4 h-4" />
            </motion.a>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-6 text-black/30 text-xs"
      >
        For Actuals
      </motion.div>
    </div>
  );
}