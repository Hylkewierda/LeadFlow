import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, X, ChevronDown, ExternalLink, Inbox, Flame, Activity, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCrmContacts, useAddNote } from "@/lib/crm/hooks";
import { createPageUrl } from "@/utils";
import ContactCard from "@/components/crm/ContactCard";
import StageStepper from "@/components/crm/StageStepper";
import { daysSince, STAGE_META, PIPELINE_STAGES } from "@/lib/crm/format";

const EASE = [0.22, 1, 0.36, 1];

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
  return r.json();
}
async function sendJSON(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
  return r.json();
}

function within7Days(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 7 * 86400000;
}

// ---- Health strip ----
function MetricCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="glass-card rounded-2xl p-3.5">
      <div className="flex items-center gap-1.5 text-foreground/50">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight text-foreground mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

// ---- Collapsible bucket ----
function Bucket({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card-elevated rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          <span className="text-[11px] font-semibold text-foreground/50 bg-foreground/[0.06] rounded-full px-2 py-0.5">
            {count}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-foreground/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export default function CrmDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = user?.email ?? null;

  const contactsQ = useCrmContacts();
  const contacts = contactsQ.data ?? [];

  const maybeQ = useQuery({ queryKey: ["maybe-leads"], queryFn: () => getJSON("/api/maybe-leads?workspace=actuals") });
  const exemplarsQ = useQuery({ queryKey: ["qualifier-exemplars"], queryFn: () => getJSON("/api/qualifier-exemplars?workspace=actuals") });

  const verdict = useMutation({
    mutationFn: ({ candidateId, v }) => sendJSON("/api/maybe-leads", "POST", { candidateId, verdict: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maybe-leads"] });
      qc.invalidateQueries({ queryKey: ["qualifier-exemplars"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
    },
  });
  const addNote = useAddNote();

  const open = (id) => navigate(`${createPageUrl("CrmContact")}?id=${id}`);

  // Derived buckets
  const maybeItems = maybeQ.data?.candidates ?? [];
  const teBenaderen = contacts.filter((c) => c.stage === "nieuw");
  const actieveDeals = contacts
    .filter((c) => ["benaderd", "gesprek", "voorstel"].includes(c.stage))
    .sort((a, b) => new Date(a.last_activity_at) - new Date(b.last_activity_at));

  // Health metrics (all rounded)
  const nieuwDezeWeek = contacts.filter((c) => within7Days(c.created_at)).length;
  const inPipeline = contacts.filter((c) => PIPELINE_STAGES.includes(c.stage) && c.stage !== "gewonnen").length;
  const exemplars = exemplarsQ.data?.exemplars ?? [];
  const triageVerdicts = exemplars.filter((e) => e.source === "maybe-triage" || e.source === "crm-outcome");
  const goCount = triageVerdicts.filter((e) => e.verdict === "GO").length;
  const goRate = triageVerdicts.length > 0 ? Math.round((goCount / triageVerdicts.length) * 100) : null;

  // Pipeline funnel
  const funnel = ["nieuw", "benaderd", "gesprek", "voorstel", "gewonnen", "verloren"].map((s) => ({
    stage: s,
    label: STAGE_META[s].label,
    chip: STAGE_META[s].chip,
    count: contacts.filter((c) => c.stage === s).length,
  }));

  return (
    <div className="flex flex-col items-center px-4 sm:px-6 pt-6 pb-8">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-5">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">CRM</h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Volg je gekwalificeerde leads op — met de scoring-context erbij.
          </p>
        </motion.div>

        {/* Health strip */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <MetricCard icon={Inbox} label="Nieuw deze week" value={nieuwDezeWeek} />
          <MetricCard icon={Activity} label="In pijplijn" value={inPipeline} />
          <MetricCard icon={Flame} label="GO-rate triage" value={goRate == null ? "—" : `${goRate}%`} hint={triageVerdicts.length > 0 ? `${triageVerdicts.length} oordelen` : "nog geen oordelen"} />
          <MetricCard icon={TrendingUp} label="Qualifier-F1" value="n.v.t." hint="geen live bron" />
        </div>

        {/* Buckets */}
        <div className="space-y-3">
          {/* MAYBE-triage */}
          <Bucket title="MAYBE-triage" count={maybeItems.length} defaultOpen>
            {maybeQ.isLoading && <p className="text-[13px] text-muted-foreground">Laden…</p>}
            {!maybeQ.isLoading && maybeItems.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Geen maybe-leads om te beoordelen. 🎉</p>
            )}
            {maybeItems.map((c) => (
              <ContactCard
                key={c.id}
                lead={{
                  name: c.name,
                  headline: c.headline,
                  role: c.role,
                  company: c.company,
                  score: c.llm_score,
                  reasoning: c.llm_reasoning,
                }}
              >
                <button
                  disabled={verdict.isPending}
                  onClick={() => verdict.mutate({ candidateId: c.id, v: "GO" })}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> GO
                </button>
                <button
                  disabled={verdict.isPending}
                  onClick={() => verdict.mutate({ candidateId: c.id, v: "NO-GO" })}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.06] text-foreground/70 text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> NO-GO
                </button>
              </ContactCard>
            ))}
          </Bucket>

          {/* Te benaderen */}
          <Bucket title="Te benaderen" count={teBenaderen.length}>
            {teBenaderen.length === 0 && <p className="text-[13px] text-muted-foreground">Niets te benaderen.</p>}
            {teBenaderen.map((c) => (
              <ContactCard
                key={c.id}
                onOpen={() => open(c.id)}
                lead={{
                  name: c.full_name,
                  headline: c.headline,
                  role: c.role,
                  company: c.crm_companies?.name,
                  score: c.source_score,
                  stage: c.stage,
                  owner: c.owner,
                }}
              >
                <button
                  disabled={addNote.isPending}
                  onClick={() => addNote.mutate({ id: c.id, body: "Eerste contact gelegd", kind: "contact_moment", author: me })}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Markeer benaderd
                </button>
                {c.linkedin_url && (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.06] text-foreground/70 text-[13px] font-medium px-3 py-2 active:scale-[0.98] transition-transform"
                  >
                    <ExternalLink className="w-4 h-4" /> LinkedIn
                  </a>
                )}
              </ContactCard>
            ))}
          </Bucket>

          {/* Actieve deals */}
          <Bucket title="Actieve deals" count={actieveDeals.length}>
            {actieveDeals.length === 0 && <p className="text-[13px] text-muted-foreground">Geen actieve deals.</p>}
            {actieveDeals.map((c) => {
              const stil = daysSince(c.last_activity_at);
              return (
                <ContactCard
                  key={c.id}
                  onOpen={() => open(c.id)}
                  lead={{
                    name: c.full_name,
                    headline: c.headline,
                    role: c.role,
                    company: c.crm_companies?.name,
                    score: c.source_score,
                    stage: c.stage,
                    owner: c.owner,
                  }}
                >
                  <div className="w-full">
                    {stil != null && stil > 7 && (
                      <span className="inline-block mb-2 text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-md px-2 py-0.5">
                        Stil &gt; {stil}d
                      </span>
                    )}
                    <StageStepper contactId={c.id} stage={c.stage} />
                  </div>
                </ContactCard>
              );
            })}
          </Bucket>

          {/* Pijplijn-gezondheid */}
          <Bucket title="Pijplijn-gezondheid" count={contacts.length}>
            <div className="space-y-1.5">
              {funnel.map((f) => (
                <div
                  key={f.stage}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-foreground/[0.03]"
                >
                  <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${f.chip}`}>{f.label}</span>
                  <span className="text-[14px] font-bold text-foreground">{f.count}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Qualifier-F1-trend: geen live bron beschikbaar (autoresearch logt lokaal).
            </p>
          </Bucket>
        </div>
      </div>
    </div>
  );
}
