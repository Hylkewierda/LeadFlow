import React from "react";
import { ExternalLink, Users } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientDatabase() {
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
            Client Database
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Beheer je klanten in HubSpot
          </p>
        </motion.div>

        {/* HubSpot card */}
        <motion.a
          href="https://app.hubspot.com/contacts"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-foreground">Open HubSpot</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Bekijk en beheer je database</p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
        </motion.a>
      </div>
    </div>
  );
}
