import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import { useCrmCompany } from "@/lib/crm/hooks";
import { createPageUrl } from "@/utils";
import { roundScore, initials, stageMeta, relativeNL } from "@/lib/crm/format";

const EASE = [0.22, 1, 0.36, 1];

// Stages considered "advanced" for the don't-double-approach warning.
const ADVANCED = ["gesprek", "voorstel", "gewonnen"];

function Stat({ label, value }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[18px] font-bold tracking-tight text-foreground mt-0.5">{value}</div>
    </div>
  );
}

export default function CrmCompany() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useCrmCompany(id);

  if (!id) return <Empty msg="Geen bedrijf geselecteerd." />;
  if (isLoading) return <Empty msg="Laden…" />;
  if (isError) return <Empty msg={error?.message || "Fout bij laden."} />;

  const company = data?.company;
  if (!company) return <Empty msg="Bedrijf niet gevonden." />;

  const rollup = data?.rollup ?? {};
  const contacts = data?.contacts ?? [];
  const maxScore = roundScore(rollup.max_source_score);
  const furthest = stageMeta(rollup.furthest_stage);

  // Warning: multiple contacts and at least one already in an advanced stage.
  const hasAdvanced = contacts.some((c) => ADVANCED.includes(c.stage));
  const showWarning = contacts.length > 1 && hasAdvanced;

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-foreground/60 hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="glass-card-elevated rounded-2xl p-4 mb-3">
          <h1 className="text-[20px] font-bold tracking-tight text-foreground">{company.name}</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {[company.industry, company.size_bucket, company.location].filter(Boolean).join(" · ") || "—"}
          </p>
          {company.linkedin_company_url && (
            <a href={company.linkedin_company_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline mt-2">
              <ExternalLink className="w-3 h-3" /> LinkedIn-bedrijfspagina
            </a>
          )}
        </motion.div>

        {/* Rollup stats */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <Stat label="Contacten" value={rollup.contact_count ?? contacts.length} />
          <Stat label="Hoogste score" value={maxScore == null ? "—" : maxScore} />
          <Stat label="Verste fase" value={furthest.label} />
          <Stat label="Laatste activiteit" value={relativeNL(rollup.last_activity_at)} />
        </div>

        {/* Don't-double-approach warning */}
        {showWarning && (
          <div className="glass-card rounded-xl p-3 mb-3 flex items-start gap-2 bg-amber-50/60">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-800 leading-relaxed">
              Meerdere contacten bij dit bedrijf en één zit al in een gevorderde fase. Stem af voor je opnieuw benadert — niet dubbel benaderen.
            </p>
          </div>
        )}

        {/* Contacts grouped */}
        <h2 className="text-[13px] font-semibold text-foreground mb-2">Contacten</h2>
        <div className="space-y-2">
          {contacts.length === 0 && <p className="text-[13px] text-muted-foreground">Nog geen contacten.</p>}
          {contacts.map((c) => {
            const stage = stageMeta(c.stage);
            const score = roundScore(c.source_score);
            return (
              <Link
                key={c.id}
                to={`${createPageUrl("CrmContact")}?id=${c.id}`}
                className="glass-card rounded-xl p-3 flex items-center gap-3 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[11px] font-semibold text-foreground/70">
                  {initials(c.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{c.full_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.role || c.headline || "—"}</p>
                </div>
                {c.owner && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold" title={`Geclaimd door ${c.owner}`}>
                    {initials(c.owner)}
                  </span>
                )}
                <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${stage.chip}`}>{stage.label}</span>
                {score != null && <span className="text-[11px] font-semibold text-foreground/60">{score}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10">
      <div className="w-full max-w-lg">
        <Link to={createPageUrl("CrmDashboard")} className="inline-flex items-center gap-1.5 text-[13px] text-foreground/60 hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> CRM
        </Link>
        <p className="text-[13px] text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}
