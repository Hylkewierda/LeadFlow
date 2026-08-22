import { PERSONAS } from "@/lib/crm/personas";
import { Check, Minus } from "lucide-react";

export default function PersonaGapPanel({ personas }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <h3 className="text-[12px] font-semibold text-foreground mb-2">Buying committee</h3>
      <div className="space-y-1.5">
        {PERSONAS.map((p) => {
          const slot = personas?.[p.key];
          const present = slot?.present;
          return (
            <div key={p.key} className="flex items-center gap-2">
              {present ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              ) : (
                <Minus className="w-3.5 h-3.5 text-foreground/25 flex-shrink-0" />
              )}
              <span className={`text-[12px] ${present ? "text-foreground" : "text-foreground/40"}`}>{p.label}</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {present ? slot.people.join(", ") : "ontbreekt"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
