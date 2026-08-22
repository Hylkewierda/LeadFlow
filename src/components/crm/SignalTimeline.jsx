import { relativeNL, signalLabel } from "@/lib/crm/format";

export default function SignalTimeline({ timeline }) {
  if (!timeline?.length) return null;
  return (
    <div className="glass-card rounded-xl p-3">
      <h3 className="text-[12px] font-semibold text-foreground mb-2">Signalen</h3>
      <div className="space-y-2">
        {timeline.map((t, i) => (
          <div key={`${t.at}-${t.person}-${i}`} className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-[12px] text-foreground">
                <span className="font-medium">{t.person}</span> · {signalLabel(t.signal_type)}
              </p>
              <p className="text-[11px] text-muted-foreground">{relativeNL(t.at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
