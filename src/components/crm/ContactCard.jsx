import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Radio } from "lucide-react";
import { scorePillClasses, roundScore, initials, stageMeta, signalLabel } from "@/lib/crm/format";

const EASE = [0.22, 1, 0.36, 1];

/**
 * One context-dependent CRM lead card (design §5). Renders whatever of the
 * common lead fields are present (score-pill, signal-badge, collapsed reasoning,
 * stage-badge, owner-avatar) and a per-bucket action row passed as `children`.
 *
 * lead: { name, headline, role, company, score, signalType, signalContext,
 *         reasoning, stage, owner }
 */
export default function ContactCard({ lead = {}, children, onOpen }) {
  const [showReason, setShowReason] = useState(false);
  const score = roundScore(lead.score);
  const sig = signalLabel(lead.signalType);
  const stage = lead.stage ? stageMeta(lead.stage) : null;
  const subtitle = [lead.role, lead.company].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[12px] font-semibold text-foreground/70">
          {initials(lead.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpen}
              className={`min-w-0 text-left ${onOpen ? "hover:opacity-70 transition-opacity" : "cursor-default"}`}
            >
              <h3 className="text-[14px] font-semibold text-foreground truncate">
                {lead.name || lead.headline || "Onbekend profiel"}
              </h3>
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{subtitle || "—"}</p>
            </button>
            {score != null && (
              <span className={`text-[11px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0 ${scorePillClasses(score)}`}>
                {score}
              </span>
            )}
          </div>

          {/* Signal + stage badges */}
          {(sig || stage || lead.owner) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {sig && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/60 bg-foreground/[0.05] rounded-md px-2 py-0.5">
                  <Radio className="w-3 h-3" /> {sig}
                </span>
              )}
              {stage && (
                <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${stage.chip}`}>{stage.label}</span>
              )}
              {lead.owner && (
                <span
                  className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold"
                  title={`Geclaimd door ${lead.owner}`}
                >
                  {initials(lead.owner)}
                </span>
              )}
            </div>
          )}

          {/* Collapsed reasoning */}
          {lead.reasoning && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowReason((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/50 hover:text-foreground/80 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showReason ? "rotate-180" : ""}`} />
                Redenering
              </button>
              {showReason && (
                <p className="text-[12px] text-foreground/70 mt-1.5 leading-relaxed">{lead.reasoning}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-bucket action row */}
      {children && <div className="flex gap-2 mt-3">{children}</div>}
    </motion.div>
  );
}
