import { barSegments } from "@/lib/crm/format";

// Slim stacked bar: emerald = gewonnen, rose = verloren, slate = open.
export default function WinLossBar({ won = 0, lost = 0, open = 0 }) {
  const seg = barSegments(won, lost, open);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
      <div className="bg-emerald-500" style={{ width: `${seg.won}%` }} />
      <div className="bg-rose-400" style={{ width: `${seg.lost}%` }} />
      <div className="bg-slate-300" style={{ width: `${seg.open}%` }} />
    </div>
  );
}
