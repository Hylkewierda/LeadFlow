import React from "react";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientDatabase() {

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-6 pt-24">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-12"
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
            <h1 className="text-2xl font-semibold text-black mb-2">Client Database</h1>
            <p className="text-black/60 text-sm">Beheer je klanten in HubSpot</p>
          </div>

          {/* HubSpot Button */}
          <motion.a
            href="https://app.hubspot.com/contacts"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full h-16 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-between px-6 group transition-all duration-300 hover:translate-x-1"
          >
            <div className="flex flex-col items-start">
              <span className="font-medium text-base">Open HubSpot</span>
              <span className="text-xs text-white/60">Bekijk en beheer je database</span>
            </div>
            <ExternalLink className="w-5 h-5 text-[#00FF33] opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.a>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-auto pt-12 text-black/30 text-xs"
      >
        For Actuals
      </motion.div>
    </div>
  );
}