import { useState } from "react";
import { Check, X } from "lucide-react";
import { useUpdateStage } from "@/lib/crm/hooks";
import { PIPELINE_STAGES, STAGE_META, DISQUALIFY_REASONS } from "@/lib/crm/format";

/**
 * Pipeline stage stepper (design §5/§6). Click a stage to move the contact there;
 * moving to 'verloren' first asks for a disqualify_reason. 'gewonnen'/'verloren'
 * write the qualifier exemplar server-side (atomic, via crm_set_stage).
 */
export default function StageStepper({ contactId, stage, compact = false }) {
  const updateStage = useUpdateStage();
  const [askLost, setAskLost] = useState(false);
  const [reason, setReason] = useState("");

  const currentIdx = PIPELINE_STAGES.indexOf(stage);

  const move = (next, extra = {}) =>
    updateStage.mutate({ id: contactId, stage: next, ...extra });

  return (
    <div className="w-full">
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((s, i) => {
          const meta = STAGE_META[s];
          const reached = stage !== "verloren" && currentIdx >= i;
          const isCurrent = stage === s;
          return (
            <button
              key={s}
              type="button"
              disabled={updateStage.isPending || isCurrent}
              onClick={() => move(s)}
              title={meta.label}
              className={`flex-1 h-7 rounded-md text-[10px] font-semibold transition-all disabled:cursor-default ${
                isCurrent
                  ? meta.chip
                  : reached
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-foreground/[0.05] text-foreground/40 hover:bg-foreground/[0.1]"
              }`}
            >
              {compact ? meta.label[0] : meta.label}
            </button>
          );
        })}
      </div>

      {/* Lost action */}
      {!askLost && stage !== "verloren" && (
        <button
          type="button"
          onClick={() => setAskLost(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600/70 hover:text-rose-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Markeer verloren
        </button>
      )}
      {askLost && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-[12px] rounded-lg border border-foreground/10 bg-background px-2 py-1.5 flex-1 min-w-[140px]"
          >
            <option value="">Reden kiezen…</option>
            {DISQUALIFY_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!reason || updateStage.isPending}
            onClick={() => {
              move("verloren", { disqualify_reason: reason });
              setAskLost(false);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" /> Bevestig
          </button>
          <button
            type="button"
            onClick={() => setAskLost(false)}
            className="text-[12px] text-foreground/50 hover:text-foreground px-2 py-1.5"
          >
            Annuleer
          </button>
        </div>
      )}
      {updateStage.isError && (
        <p className="mt-1.5 text-[11px] text-rose-600">Stage-wijziging mislukt.</p>
      )}
    </div>
  );
}
