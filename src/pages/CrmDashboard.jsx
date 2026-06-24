import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, ExternalLink, Inbox, Activity, TrendingUp, Trophy, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCrmContacts, useAddNote, useCreateContact, useScheduleFollowup } from "@/lib/crm/hooks";
import { listHomeTopLeads } from "@/lib/topleads/data";
import { combinedScore } from "@/lib/topleads/scoring";
import { createPageUrl } from "@/utils";
import ContactCard from "@/components/crm/ContactCard";
import StageStepper from "@/components/crm/StageStepper";
import { daysSince, STAGE_META, PIPELINE_STAGES, isDue, isOverdue, addDaysISO } from "@/lib/crm/format";

const EASE = [0.22, 1, 0.36, 1];

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
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          <span className="text-[11px] font-semibold text-foreground/50 bg-foreground/[0.06] rounded-full px-2 py-0.5">{count}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-foreground/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.email ?? null;

  const contactsQ = useCrmContacts();
  const contacts = contactsQ.data ?? [];

  // Top leads (home_top_leads) are the CRM's intake. Read-through: they show here
  // automatically; "Opvolgen" turns one into a real crm_contact (claimed by you).
  const topLeadsQ = useQuery({ queryKey: ["home-top-leads"], queryFn: listHomeTopLeads });
  const createContact = useCreateContact();
  const addNote = useAddNote();
  const schedule = useScheduleFollowup();

  const open = (id) => navigate(`${createPageUrl("CrmContact")}?id=${id}`);

  // A top lead leaves the intake bucket once a contact exists for that person.
  const contactUrls = new Set(contacts.map((c) => c.linkedin_url));
  const topLeadsOpen = (topLeadsQ.data ?? [])
    .filter((t) => !contactUrls.has(t.linkedin_url))
    .sort((a, b) => combinedScore(b) - combinedScore(a));

  // Follow-up buckets (sourced from crm_contacts)
  const teBenaderen = contacts.filter((c) => c.stage === "nieuw");
  const actieveDeals = contacts
    .filter((c) => ["benaderd", "gesprek", "voorstel"].includes(c.stage))
    .sort((a, b) => new Date(a.last_activity_at) - new Date(b.last_activity_at));

  const vandaagOpvolgen = contacts
    .filter((c) => isDue(c.next_action_at) && !["gewonnen", "verloren"].includes(c.stage))
    .sort((a, b) => (a.next_action_at < b.next_action_at ? -1 : a.next_action_at > b.next_action_at ? 1 : 0));

  // Health metrics (all rounded)
  const nieuwDezeWeek = contacts.filter((c) => within7Days(c.created_at)).length;
  const inPipeline = contacts.filter((c) => PIPELINE_STAGES.includes(c.stage) && c.stage !== "gewonnen").length;

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
          <p className="text-muted-foreground text-[13px] mt-1">Volg je top leads op — met de scoring-context erbij.</p>
        </motion.div>

        {/* Health strip */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <MetricCard icon={Trophy} label="Top leads open" value={topLeadsOpen.length} />
          <MetricCard icon={Inbox} label="Nieuw deze week" value={nieuwDezeWeek} />
          <MetricCard icon={Activity} label="In pijplijn" value={inPipeline} />
          <MetricCard icon={TrendingUp} label="Qualifier-F1" value="n.v.t." hint="geen live bron" />
        </div>

        {/* Buckets */}
        <div className="space-y-3">
          {/* Vandaag opvolgen — daily driver */}
          <Bucket title="Vandaag opvolgen" count={vandaagOpvolgen.length} defaultOpen>
            {vandaagOpvolgen.length === 0 && <p className="text-[13px] text-muted-foreground">Niets te doen vandaag 🎉</p>}
            {vandaagOpvolgen.map((c) => (
              <ContactCard
                key={c.id}
                onOpen={() => open(c.id)}
                lead={{ name: c.full_name, headline: c.headline, role: c.role, company: c.crm_companies?.name, score: c.source_score, stage: c.stage, owner: c.owner }}
              >
                <div className="w-full">
                  {isOverdue(c.next_action_at) && (
                    <span className="inline-block mb-2 text-[11px] font-semibold text-rose-700 bg-rose-100 rounded-md px-2 py-0.5">Over tijd</span>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={addNote.isPending}
                      onClick={() => addNote.mutate({ id: c.id, body: "Opgevolgd", kind: "contact_moment", author: me })}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-medium px-3 py-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                      Gedaan
                    </button>
                    <button
                      disabled={schedule.isPending}
                      onClick={() => schedule.mutate({ id: c.id, next_action_at: addDaysISO(1) })}
                      className="inline-flex items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                      +1 dag
                    </button>
                    <button
                      disabled={schedule.isPending}
                      onClick={() => schedule.mutate({ id: c.id, next_action_at: addDaysISO(7) })}
                      className="inline-flex items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/70 text-[12px] font-medium px-3 py-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                      +1 week
                    </button>
                  </div>
                </div>
              </ContactCard>
            ))}
          </Bucket>

          {/* Top leads — intake */}
          <Bucket title="Top leads" count={topLeadsOpen.length}>
            {topLeadsQ.isLoading && <p className="text-[13px] text-muted-foreground">Laden…</p>}
            {!topLeadsQ.isLoading && topLeadsOpen.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Alle top leads zijn al opgepakt. 🎉</p>
            )}
            {topLeadsOpen.map((t) => {
              const p = t.profile || {};
              return (
                <ContactCard
                  key={t.id}
                  lead={{ name: p.name, headline: p.headline, role: p.role, company: p.company, score: t.icp_score }}
                >
                  <button
                    disabled={createContact.isPending}
                    onClick={() => createContact.mutate({ source: "home_top_lead", linkedin_url: t.linkedin_url, owner: me })}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" /> Opvolgen
                  </button>
                  {t.linkedin_url && (
                    <a
                      href={t.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.06] text-foreground/70 text-[13px] font-medium px-3 py-2 active:scale-[0.98] transition-transform"
                    >
                      <ExternalLink className="w-4 h-4" /> LinkedIn
                    </a>
                  )}
                </ContactCard>
              );
            })}
          </Bucket>

          {/* Te benaderen */}
          <Bucket title="Te benaderen" count={teBenaderen.length}>
            {teBenaderen.length === 0 && <p className="text-[13px] text-muted-foreground">Niets te benaderen.</p>}
            {teBenaderen.map((c) => (
              <ContactCard
                key={c.id}
                onOpen={() => open(c.id)}
                lead={{ name: c.full_name, headline: c.headline, role: c.role, company: c.crm_companies?.name, score: c.source_score, stage: c.stage, owner: c.owner }}
              >
                <button
                  disabled={addNote.isPending}
                  onClick={() => addNote.mutate({ id: c.id, body: "Eerste contact gelegd", kind: "contact_moment", author: me })}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium py-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Markeer benaderd
                </button>
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.06] text-foreground/70 text-[13px] font-medium px-3 py-2 active:scale-[0.98] transition-transform">
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
                  lead={{ name: c.full_name, headline: c.headline, role: c.role, company: c.crm_companies?.name, score: c.source_score, stage: c.stage, owner: c.owner }}
                >
                  <div className="w-full">
                    {stil != null && stil > 7 && (
                      <span className="inline-block mb-2 text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-md px-2 py-0.5">Stil &gt; {stil}d</span>
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
                <div key={f.stage} className="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-foreground/[0.03]">
                  <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${f.chip}`}>{f.label}</span>
                  <span className="text-[14px] font-bold text-foreground">{f.count}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Qualifier-F1-trend: geen live bron beschikbaar (autoresearch logt lokaal).</p>
            <button
              type="button"
              onClick={() => navigate(createPageUrl("CrmAnalytics"))}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 hover:underline"
            >
              Bekijk analyse →
            </button>
          </Bucket>
        </div>
      </div>
    </div>
  );
}
