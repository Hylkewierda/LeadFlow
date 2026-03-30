import React from "react";
import { ExternalLink, MessageCircle, Megaphone, MessagesSquare, Brain } from "lucide-react";
import { motion } from "framer-motion";

const SHEETS = [
  {
    label: "Post Interactions",
    description: "Analyse van post engagement",
    icon: MessageCircle,
    url: "https://docs.google.com/spreadsheets/d/1pbEkpn9q6W9m4_ddOaCfzMqWvRENsTQJYA3duHMCA_c",
  },
  {
    label: "Campaign Interactions",
    description: "Campaign resultaten",
    icon: Megaphone,
    url: "https://docs.google.com/spreadsheets/d/1EZUohOXUM_JWqXJzFRxjBiqrM3ghwpwmrxcjzHJFU_k/edit?gid=0#gid=0",
  },
  {
    label: "Comment Interactions",
    description: "Comment analyses",
    icon: MessagesSquare,
    url: "https://docs.google.com/spreadsheets/d/1u_KRRxPS4R6icWIbOZK9qJ3x1oRpsw0jnF8C19FvPmg/edit?gid=0#gid=0",
  },
  {
    label: "Reasoning",
    description: "AI beslissingslogica",
    icon: Brain,
    url: "https://docs.google.com/spreadsheets/d/1rlLCDAC_Q4VxeNRsl0d8lmqT0DngttkUuIlqIgrRmBM/edit?gid=0#gid=0",
  },
];

export default function InteractionsReasoning() {
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
            Interactions & Reasoning
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Bekijk de resultaten van je workflows
          </p>
        </motion.div>

        {/* Sheet cards */}
        <div className="space-y-3">
          {SHEETS.map((sheet, index) => {
            const Icon = sheet.icon;
            return (
              <motion.a
                key={sheet.label}
                href={sheet.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="glass-card rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center group-hover:bg-accent group-hover:accent-glow transition-all duration-300">
                  <Icon className="w-4.5 h-4.5 text-foreground/60 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">{sheet.label}</h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{sheet.description}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
              </motion.a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
