import React, { useState } from "react";
import { ExternalLink, Loader2, CheckCircle2, Send, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WEBHOOK_URL = "https://hylkewnl.app.n8n.cloud/webhook/d95c131d-80dd-4b96-9d1b-916bb82e7390";

export default function SendMessage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = async () => {
    setIsLoading(true);
    setError(null);
    setIsComplete(false);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_message" }),
      });

      if (!response.ok) throw new Error("Bericht kon niet worden verzonden");
      setIsComplete(true);
    } catch {
      setError("Er ging iets mis. Controleer de webhook URL.");
    } finally {
      setIsLoading(false);
    }
  };

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
            Validated Leads
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Verstuur berichten of bekijk de lijst
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3"
            >
              {/* HubSpot link */}
              <motion.a
                href="https://app.hubspot.com/contacts/7061944/objects/0-1/views/all/list"
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="glass-card rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <ExternalLink className="w-4.5 h-4.5 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">Bekijk in HubSpot</h3>
                  <p className="text-[12px] text-muted-foreground">Open de validated leads</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
              </motion.a>

              {/* Send message button */}
              <motion.button
                onClick={sendMessage}
                disabled={isLoading}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center group-hover:bg-accent group-hover:accent-glow transition-all duration-300">
                  {isLoading ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin text-foreground" />
                  ) : (
                    <Send className="w-4.5 h-4.5 text-foreground/60 group-hover:text-white transition-colors" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">Create message</h3>
                  <p className="text-[12px] text-muted-foreground">Verstuur gepersonaliseerde berichten</p>
                </div>
              </motion.button>

              {/* View leads sheet */}
              <motion.a
                href="https://docs.google.com/spreadsheets/d/1d5R3qaMzAZO5yee40JKzyNpDRGv0g2BhR9Zlq0k6-9g/edit?gid=0#gid=0"
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24 }}
                className="glass-card rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-foreground/60" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">View leads</h3>
                  <p className="text-[12px] text-muted-foreground">Bekijk de verzendlijst</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-accent transition-colors" />
              </motion.a>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 py-3 bg-destructive/8 border border-destructive/15 rounded-2xl"
                >
                  <p className="text-destructive text-[13px] font-medium">{error}</p>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center pt-12"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }}
                className="w-20 h-20 rounded-[22px] bg-accent flex items-center justify-center mx-auto mb-8 accent-glow"
              >
                <CheckCircle2 className="w-9 h-9 text-white" strokeWidth={2} />
              </motion.div>

              <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-2">
                Bericht verzonden
              </h2>
              <p className="text-muted-foreground text-[13px] mb-10">
                Je bericht is succesvol verstuurd
              </p>

              <button
                onClick={() => { setIsComplete(false); setError(null); }}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Nieuw bericht versturen
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
