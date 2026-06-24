import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useCrmAnalytics } from "@/lib/crm/hooks";
import { createPageUrl } from "@/utils";
import WinLossBar from "@/components/crm/WinLossBar";

const EASE = [0.22, 1, 0.36, 1];

function pct(v) {
  return v == null ? "—" : `${v}%`;
}

function DimRow({ row }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[12px] text-foreground/80 truncate">{row.label}</span>
        <span className="text-[12px] font-semibold text-foreground flex-shrink-0">
          {pct(row.winRate)} <span className="text-foreground/40 font-normal">· {row.won}/{row.lost}/{row.open}</span>
        </span>
      </div>
      <WinLossBar won={row.won} lost={row.lost} open={row.open} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="glass-card rounded-2xl p-4 mb-3">
      <h2 className="text-[13px] font-semibold text-foreground mb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function CrmAnalytics() {
  const { data, isLoading, isError, error } = useCrmAnalytics();

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <Link to={createPageUrl("CrmDashboard")} className="inline-flex items-center gap-1.5 text-[13px] text-foreground/60 hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Terug naar CRM
        </Link>

        {isLoading && <p className="text-[13px] text-muted-foreground">Laden…</p>}
        {isError && <p className="text-[13px] text-rose-600">{error?.message || "Fout bij laden."}</p>}

        {data && (
          <>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="glass-card-elevated rounded-2xl p-4 mb-4">
              <div className="text-[11px] font-medium text-foreground/50">Win-rate</div>
              {data.totals.closed === 0 ? (
                <>
                  <div className="text-[18px] font-bold text-foreground mt-1">Nog geen afgesloten deals</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{data.totals.open} nog open</div>
                </>
              ) : (
                <>
                  <div className="text-[32px] font-bold tracking-tight text-foreground mt-1">{pct(data.totals.winRate)}</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {data.totals.won} gewonnen · {data.totals.lost} verloren · {data.totals.open} open
                  </div>
                </>
              )}
            </motion.div>

            <h1 className="text-[14px] font-bold text-foreground mb-2">Lead-kwaliteit</h1>
            <Section title="Score-band">{data.byDimension.scoreBand.map((r) => <DimRow key={r.key} row={r} />)}</Section>
            <Section title="Bron">{data.byDimension.source.map((r) => <DimRow key={r.key} row={r} />)}</Section>
            <Section title="Signaaltype">{data.byDimension.signalType.map((r) => <DimRow key={r.key} row={r} />)}</Section>

            <h1 className="text-[14px] font-bold text-foreground mb-2 mt-5">Sales-proces</h1>
            <Section title="Top verlies-redenen">
              {data.lossReasons.length === 0 && <p className="text-[12px] text-muted-foreground">Nog geen verloren deals.</p>}
              {data.lossReasons.map((r) => (
                <div key={r.reason} className="flex items-center justify-between py-1">
                  <span className="text-[12px] text-foreground/80">{r.label}</span>
                  <span className="text-[12px] font-semibold text-foreground">{r.count}</span>
                </div>
              ))}
            </Section>
            <Section title="Win-rate per owner">
              {data.byOwner.length === 0 && <p className="text-[12px] text-muted-foreground">Nog geen afgesloten deals.</p>}
              {data.byOwner.map((o) => (
                <div key={o.owner ?? "__none__"} className="flex items-center justify-between py-1">
                  <span className="text-[12px] text-foreground/80 truncate">{o.owner ?? "Ongeclaimd"}</span>
                  <span className="text-[12px] font-semibold text-foreground">
                    {pct(o.winRate)} <span className="text-foreground/40 font-normal">· {o.won}/{o.lost}</span>
                  </span>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
