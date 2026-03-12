import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, CheckCircle2, Send } from "lucide-react";
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "send_message" }),
      });

      if (!response.ok) {
        throw new Error("Bericht kon niet worden verzonden");
      }

      setIsComplete(true);
    } catch (err) {
      setError("Er ging iets mis. Controleer de webhook URL.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setIsComplete(false);
    setError(null);
  };

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

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key="buttons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Header */}
              <div className="text-center mb-10">
                <h1 className="text-2xl font-semibold text-black mb-2">Validated Leads</h1>
                <p className="text-black/60 text-sm">Verstuur berichten of bekijk de lijst</p>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <a
                    href="https://app.hubspot.com/contacts/7061944/objects/0-1/views/all/list"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-16 bg-[#00FF33] hover:bg-[#00FF33]/90 text-black rounded-xl flex items-center justify-between px-6 group transition-all duration-300 hover:translate-x-1"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-base">Bekijk in HubSpot</span>
                      <span className="text-xs text-black/60">Open de validated leads</span>
                    </div>
                    <ExternalLink className="w-5 h-5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Button
                    onClick={sendMessage}
                    disabled={isLoading}
                    className="w-full h-16 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-between px-6 group transition-all duration-300 hover:translate-x-1"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-base">Create message</span>
                      <span className="text-xs text-white/60">Verstuur gepersonaliseerde berichten naar nieuwe leads</span>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 text-[#00FF33] opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </Button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <a
                    href="https://docs.google.com/spreadsheets/d/1d5R3qaMzAZO5yee40JKzyNpDRGv0g2BhR9Zlq0k6-9g/edit?gid=0#gid=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-16 bg-black hover:bg-black/90 text-white rounded-xl flex items-center justify-between px-6 group transition-all duration-300 hover:translate-x-1"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-base">View leads</span>
                      <span className="text-xs text-white/60">Bekijk de verzendlijst</span>
                    </div>
                    <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </motion.div>
              </div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-center"
                >
                  <p className="text-red-600 text-sm">{error}</p>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
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

              <h2 className="text-2xl font-semibold text-black mb-2">Bericht Verzonden</h2>
              <p className="text-black/60 text-sm mb-10">Je bericht is succesvol verstuurd</p>

              {/* Back Button */}
              <motion.button
                onClick={resetState}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-8 text-black/50 hover:text-black text-sm underline underline-offset-4 transition-colors"
              >
                Nieuw bericht versturen
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
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