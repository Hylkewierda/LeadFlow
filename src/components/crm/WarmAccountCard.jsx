import { Flame } from "lucide-react";
import { relativeNL, signalLabel } from "@/lib/crm/format";
import PersonaChips from "@/components/crm/PersonaChips";

function explainLine(account) {
  const parts = [
    `${account.person_count} ${account.person_count === 1 ? "persoon" : "personen"}`,
    `${account.signal_count} ${account.signal_count === 1 ? "signaal" : "signalen"}`,
    relativeNL(account.last_signal_at),
  ];
  const comp = account.signal_type_counts?.competitor_engagement;
  if (comp) parts.push(`${comp}× ${signalLabel("competitor_engagement").toLowerCase()}`);
  return parts.filter(Boolean).join(" · ");
}

export default function WarmAccountCard({ account, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left glass-card rounded-xl p-3 hover:bg-foreground/[0.02] transition-colors">
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-[13px] font-semibold text-foreground truncate">{account.name}</span>
        {!account.in_crm && (
          <span className="text-[10px] font-medium rounded-md px-1.5 py-0.5 bg-foreground/[0.06] text-foreground/50 flex-shrink-0">
            nog niet in CRM
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{explainLine(account)}</p>
      <div className="mt-2">
        <PersonaChips personas={account.personas} />
      </div>
    </button>
  );
}
